import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { expect, request as apiRequest, test } from "@playwright/test";

const { createDatabasePool } = await import(
  new URL("../../../backend-sigecom/src/db/pool.js", import.meta.url)
);
const password = process.env.SIGECOM_E2E_PASSWORD;
const adminEmail = "frontend-e2e-admin@sigecom.invalid";
const auditorEmail = "frontend-e2e-auditor@sigecom.invalid";
const screenshotDirectory = join(tmpdir(), "opencode", "sigecom-6-1c");

async function signIn(page, email) {
  await page.goto("/ingresar");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByRole("textbox", { name: "Contraseña" }).fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/inicio$/);
}

async function signInApi(apiContext, email) {
  const csrfResponse = await apiContext.get("/api/v1/auth/csrf");
  expect(csrfResponse.ok()).toBeTruthy();
  const { csrfToken } = await csrfResponse.json();
  const response = await apiContext.post("/api/v1/auth/login", {
    data: { email, password },
    headers: { "X-CSRF-Token": csrfToken },
  });
  expect(response.status()).toBe(200);
}

async function openRolePermissions(page) {
  await page.goto("/administracion/roles");
  await expect(
    page.getByRole("heading", { name: "Roles y permisos", level: 2 }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "Rol" }).selectOption("auditor");
  await expect(
    page.getByRole("heading", { name: "Auditor", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Consultar proveedores", { exact: true }),
  ).toBeVisible();
}

test("administrator removes a role permission, affected session is revoked, then restores access", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const pool = createDatabasePool("test");
  const auditorApi = await apiRequest.newContext({
    baseURL: "http://127.0.0.1:3002",
    extraHTTPHeaders: { Origin: "http://127.0.0.1:5174" },
  });
  let originalCreatedAt;
  let roleId;
  let permissionId;
  let adminId;
  let addedAdminWarehouseIds = [];
  try {
    const [[database]] = await pool.query("SELECT DATABASE() AS name");
    expect(database.name).toBe("sigecom_test");
    const [[role]] = await pool.execute(
      "SELECT id FROM roles WHERE code = 'auditor'",
    );
    const [[permission]] = await pool.execute(
      "SELECT id FROM permissions WHERE code = 'suppliers.read'",
    );
    const [[assignment]] = await pool.execute(
      "SELECT created_at FROM role_permissions WHERE role_id = ? AND permission_id = ?",
      [role.id, permission.id],
    );
    expect(assignment).toBeTruthy();
    roleId = role.id;
    permissionId = permission.id;
    originalCreatedAt = assignment.created_at;
    const [[admin]] = await pool.execute(
      "SELECT id FROM users WHERE email = ?",
      [adminEmail],
    );
    adminId = admin.id;
    const [currentAdminWarehouses] = await pool.execute(
      "SELECT warehouse_id FROM user_warehouses WHERE user_id = ?",
      [adminId],
    );
    const currentAdminWarehouseIds = new Set(
      currentAdminWarehouses.map((item) => String(item.warehouse_id)),
    );
    const [sellerWarehouses] = await pool.execute(
      `SELECT DISTINCT uw.warehouse_id FROM users u
       JOIN user_warehouses uw ON uw.user_id = u.id WHERE u.role_id = ?
       ORDER BY uw.warehouse_id`,
      [roleId],
    );
    addedAdminWarehouseIds = sellerWarehouses
      .map((item) => String(item.warehouse_id))
      .filter((id) => !currentAdminWarehouseIds.has(id));
    for (const warehouseId of addedAdminWarehouseIds) {
      await pool.execute(
        "INSERT INTO user_warehouses (user_id, warehouse_id) VALUES (?, ?)",
        [adminId, warehouseId],
      );
    }

    await signInApi(auditorApi, auditorEmail);
    const auditorCookie = (await auditorApi.storageState()).cookies.find(
      (cookie) => cookie.name === "sigecom_session",
    );
    expect(auditorCookie).toBeTruthy();
    const claims = JSON.parse(
      Buffer.from(auditorCookie.value.split(".")[1], "base64url").toString(),
    );
    const tokenHash = createHash("sha256").update(claims.jti).digest("hex");
    const [[auditorSession]] = await pool.execute(
      "SELECT id, revoked_at, expires_at FROM user_sessions WHERE token_hash = ?",
      [tokenHash],
    );
    expect(auditorSession).toBeTruthy();

    await signIn(page, adminEmail);
    await openRolePermissions(page);
    const readSuppliers = page.getByRole("checkbox", {
      name: /Consultar proveedores/,
    });
    await expect(readSuppliers).toBeChecked();
    await readSuppliers.uncheck();
    await page.getByRole("button", { name: /Revisar cambios/ }).click();
    await expect(
      page.getByRole("heading", { name: "Se retirarán (1)" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirmar y guardar" }).click();
    await expect(readSuppliers).not.toBeChecked();

    const [[sessionAfterUpdate]] = await pool.execute(
      "SELECT id, revoked_at, expires_at FROM user_sessions WHERE token_hash = ?",
      [tokenHash],
    );
    expect(Number(sessionAfterUpdate.id)).toBe(Number(auditorSession.id));
    expect(sessionAfterUpdate.revoked_at).not.toBeNull();

    const expiredResponse = await auditorApi.get("/api/v1/auth/me");
    expect(expiredResponse.status()).toBe(401);

    await signInApi(auditorApi, auditorEmail);
    const deniedSuppliers = await auditorApi.get("/api/v1/suppliers");
    expect(deniedSuppliers.status()).toBe(403);

    await readSuppliers.check();
    await page.getByRole("button", { name: /Revisar cambios/ }).click();
    await expect(
      page.getByRole("heading", { name: "Se añadirán (1)" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirmar y guardar" }).click();
    await expect(readSuppliers).toBeChecked();

    await signInApi(auditorApi, auditorEmail);
    const authorizedSuppliers = await auditorApi.get("/api/v1/suppliers");
    expect(authorizedSuppliers.status()).toBe(200);

    await mkdir(screenshotDirectory, { recursive: true });
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1280, height: 720 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/administracion/roles");
      await expect(
        page.getByRole("heading", { name: "Roles y permisos", level: 2 }),
      ).toBeVisible();
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
      }));
      expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
      await page.screenshot({
        path: join(
          screenshotDirectory,
          `roles-${viewport.width}x${viewport.height}.png`,
        ),
        fullPage: true,
      });
    }
  } finally {
    await auditorApi.dispose();
    if (roleId && permissionId && originalCreatedAt) {
      const [[present]] = await pool.execute(
        "SELECT 1 AS present FROM role_permissions WHERE role_id = ? AND permission_id = ?",
        [roleId, permissionId],
      );
      if (!present) {
        await pool.execute(
          "INSERT INTO role_permissions (role_id, permission_id, created_at) VALUES (?, ?, ?)",
          [roleId, permissionId, originalCreatedAt],
        );
      } else {
        await pool.execute(
          "UPDATE role_permissions SET created_at = ? WHERE role_id = ? AND permission_id = ?",
          [originalCreatedAt, roleId, permissionId],
        );
      }
    }
    try {
      if (adminId && addedAdminWarehouseIds.length) {
        await pool.execute(
          `DELETE FROM user_warehouses WHERE user_id = ?
           AND warehouse_id IN (${addedAdminWarehouseIds.map(() => "?").join(",")})`,
          [adminId, ...addedAdminWarehouseIds],
        );
      }
      await pool.execute(
        `UPDATE user_sessions s JOIN users u ON u.id = s.user_id
         SET s.revoked_at = UTC_TIMESTAMP(3)
         WHERE u.email = ? AND s.revoked_at IS NULL`,
        [auditorEmail],
      );
    } finally {
      await pool.end();
    }
  }
});
