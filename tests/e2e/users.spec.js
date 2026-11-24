import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createDatabasePool } from "../../../backend-sigecom/src/db/pool.js";

const screenshotDirectory = join(tmpdir(), "opencode", "sigecom-6.1a-visual");

test.use({ trace: "off", screenshot: "off", video: "off" });

async function signIn(page) {
  await page.goto("/ingresar");
  await page
    .getByLabel("Correo electrónico")
    .fill("frontend-e2e-admin@sigecom.invalid");
  await page
    .getByRole("textbox", { name: "Contraseña" })
    .fill(process.env.SIGECOM_E2E_PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/inicio$/);
}

test("administrator can consult the user directory at required responsive viewports", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const pool = createDatabasePool("test");
  let testEmail;
  let warehouse;
  try {
    const [[database]] = await pool.query("SELECT DATABASE() AS name");
    expect(database.name).toBe("sigecom_test");
    const [[admin]] = await pool.execute(
      "SELECT id FROM users WHERE email = 'frontend-e2e-admin@sigecom.invalid'",
    );
    [[warehouse]] = await pool.execute(
      "SELECT id, code, name FROM warehouses WHERE is_active = 1 ORDER BY id LIMIT 1",
    );
    expect(admin).toBeTruthy();
    expect(warehouse).toBeTruthy();
    await pool.execute(
      "INSERT IGNORE INTO user_warehouses (user_id, warehouse_id, assigned_by) VALUES (?, ?, ?)",
      [admin.id, warehouse.id, admin.id],
    );

    await signIn(page);
    await page
      .getByRole("navigation", { name: "Navegación principal" })
      .getByRole("link", { name: "Usuarios", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Usuarios", level: 2 }),
    ).toBeVisible();
    await expect(
      page.getByRole("searchbox", { name: "Buscar por nombre o correo" }),
    ).toBeVisible();
    await expect(page.getByLabel("Rol")).toBeVisible();
    await expect(page.getByLabel("Estado")).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Usuarios" }).getByRole("table"),
    ).toBeVisible();

    await mkdir(screenshotDirectory, { recursive: true });
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1280, height: 720 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: join(
          screenshotDirectory,
          `usuarios-${viewport.width}x${viewport.height}.png`,
        ),
        fullPage: true,
      });
    }
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.getByRole("button", { name: "Nuevo usuario" }).click();
      const dialog = page.getByRole("dialog", { name: "Nuevo usuario" });
      await expect(dialog).toBeVisible();
      expect(
        await dialog.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: join(
          screenshotDirectory,
          `usuarios-dialogo-${viewport.width}x${viewport.height}.png`,
        ),
        fullPage: true,
      });
      await dialog.getByRole("button", { name: "Cancelar" }).click();
    }

    await page.setViewportSize({ width: 1280, height: 720 });
    const suffix = Date.now().toString();
    testEmail = `users-e2e-${suffix}@sigecom.invalid`;
    await page.getByRole("button", { name: "Nuevo usuario" }).click();
    await page.getByLabel("Nombre completo").fill(`Usuario E2E ${suffix}`);
    await page.getByLabel("Correo electrónico").fill(testEmail);
    await page
      .getByRole("searchbox", { name: "Buscar bodegas autorizadas" })
      .fill(warehouse.code);
    await page
      .getByRole("checkbox", { name: new RegExp(warehouse.name) })
      .check();
    await page.getByRole("button", { name: "Crear usuario" }).click();
    await expect(page.getByRole("status")).toContainText(
      /simulado.*no se envió ningún correo.*invitación sigue pendiente/i,
    );
    await expect(page.getByText(/contraseña temporal/i)).toHaveCount(0);
    await page
      .getByRole("searchbox", { name: "Buscar por nombre o correo" })
      .fill(testEmail);
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    const userRow = page.getByRole("row", { name: new RegExp(testEmail) });
    await expect(userRow).toBeVisible();
    await expect(
      userRow.getByText("Invitación pendiente", { exact: true }),
    ).toBeVisible();
    await userRow
      .getByRole("button", {
        name: new RegExp(`Desactivar Usuario E2E ${suffix}`),
      })
      .click();
    const confirmDialog = page.getByRole("dialog", {
      name: "Desactivar cuenta",
    });
    await confirmDialog
      .getByRole("button", { name: "Desactivar cuenta" })
      .click();
    await expect(userRow.getByText("Inactiva", { exact: true })).toBeVisible();
  } finally {
    if (testEmail) {
      const [[created]] = await pool.execute(
        "SELECT id FROM users WHERE email = ?",
        [testEmail],
      );
      if (created) {
        await pool.execute(
          `UPDATE account_access_tokens
           SET revoked_at = UTC_TIMESTAMP(3)
           WHERE user_id = ? AND revoked_at IS NULL`,
          [created.id],
        );
        await pool.execute(
          "UPDATE user_sessions SET revoked_at = UTC_TIMESTAMP(3) WHERE user_id = ? AND revoked_at IS NULL",
          [created.id],
        );
        await pool.execute("UPDATE users SET is_active = 0 WHERE id = ?", [
          created.id,
        ]);
      }
    }
    await pool.end();
  }
});
