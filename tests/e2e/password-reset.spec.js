import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createDatabasePool } from "../../../backend-sigecom/src/db/pool.js";

const backendRequire = createRequire(
  new URL("../../../backend-sigecom/package.json", import.meta.url),
);
const bcrypt = backendRequire("bcrypt");
const visualDirectory = join(tmpdir(), "opencode", "sigecom-6.1b-visual");

test.use({ trace: "off", screenshot: "off", video: "off" });

test("administrator requests a reset link, revokes prior access, and reports simulated delivery", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const pool = createDatabasePool("test");
  const suffix = randomBytes(8).toString("hex");
  const email = `password-reset-e2e-${suffix}@sigecom.invalid`;
  const originalPassword = randomBytes(32).toString("base64url");
  let userId;
  let previousContext;
  let recipientContext;

  try {
    const [[database]] = await pool.query("SELECT DATABASE() AS name");
    expect(database.name).toBe("sigecom_test");
    const [[role]] = await pool.execute(
      "SELECT id FROM roles WHERE code = 'seller'",
    );
    const [[admin]] = await pool.execute(
      "SELECT id FROM users WHERE email = 'frontend-e2e-admin@sigecom.invalid' AND is_active = 1",
    );
    const [[warehouse]] = await pool.execute(
      `SELECT warehouse_id AS id FROM user_warehouses
       WHERE user_id = ? ORDER BY warehouse_id LIMIT 1`,
      [admin.id],
    );
    expect(role && admin && warehouse).toBeTruthy();
    const [created] = await pool.execute(
      `INSERT INTO users (role_id, email, display_name, password_hash,
                         is_active, password_change_required)
       VALUES (?, ?, 'Usuario E2E de restablecimiento', ?, 1, 0)`,
      [role.id, email, await bcrypt.hash(originalPassword, 12)],
    );
    userId = String(created.insertId);
    await pool.execute(
      "INSERT INTO user_warehouses (user_id, warehouse_id, assigned_by) VALUES (?, ?, ?)",
      [userId, warehouse.id, admin.id],
    );

    previousContext = await browser.newContext({
      baseURL: "http://127.0.0.1:5174",
    });
    const previousPage = await previousContext.newPage();
    await previousPage.goto("/ingresar");
    await previousPage.getByLabel("Correo electrónico").fill(email);
    await previousPage
      .getByRole("textbox", { name: "Contraseña" })
      .fill(originalPassword);
    await previousPage.getByRole("button", { name: "Ingresar" }).click();
    await expect(previousPage).toHaveURL(/\/inicio$/);

    await page.goto("/ingresar");
    await page
      .getByLabel("Correo electrónico")
      .fill("frontend-e2e-admin@sigecom.invalid");
    await page
      .getByRole("textbox", { name: "Contraseña" })
      .fill(process.env.SIGECOM_E2E_PASSWORD);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page).toHaveURL(/\/inicio$/);
    await page
      .getByRole("navigation", { name: "Navegación principal" })
      .getByRole("link", { name: "Usuarios", exact: true })
      .click();
    const search = page.getByRole("searchbox", {
      name: "Buscar por nombre o correo",
    });
    await search.fill(email);
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    const row = page.getByRole("row", { name: new RegExp(email) });
    await expect(row).toBeVisible();
    await row
      .getByRole("button", {
        name: "Restablecer contraseña de Usuario E2E de restablecimiento",
      })
      .click();
    const confirmation = page.getByRole("dialog", {
      name: "Restablecer contraseña",
    });
    await expect(confirmation).toContainText(email);
    await expect(
      confirmation.getByRole("button", { name: "Cancelar" }),
    ).toBeFocused();
    await mkdir(visualDirectory, { recursive: true });
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
      expect(
        await confirmation.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: join(
          visualDirectory,
          `restablecimiento-${viewport.width}x${viewport.height}.png`,
        ),
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    await confirmation
      .getByRole("button", { name: "Confirmar restablecimiento" })
      .click();
    await expect(page.getByRole("status")).toContainText(
      /simulado.*no se envió ningún correo.*cuenta sigue pendiente de restablecimiento/i,
    );
    const [[stored]] = await pool.execute(
      `SELECT credential_state, password_change_required
       FROM users WHERE id = ?`,
      [userId],
    );
    expect(stored.credential_state).toBe("pending_admin_reset");
    expect(Number(stored.password_change_required)).toBe(1);
    expect(
      await previousPage.evaluate(
        async () =>
          (await fetch("/api/v1/auth/me", { credentials: "include" })).status,
      ),
    ).toBe(401);

    recipientContext = await browser.newContext({
      baseURL: "http://127.0.0.1:5174",
    });
    const recipient = await recipientContext.newPage();
    await recipient.goto("/ingresar");
    await recipient.getByLabel("Correo electrónico").fill(email);
    await recipient
      .getByRole("textbox", { name: "Contraseña" })
      .fill(originalPassword);
    await recipient.getByRole("button", { name: "Ingresar" }).click();
    await expect(recipient.getByRole("alert")).toContainText("incorrectos");
  } finally {
    await previousContext?.close();
    await recipientContext?.close();
    if (userId) {
      await pool.execute(
        `UPDATE account_access_tokens
         SET revoked_at = UTC_TIMESTAMP(3)
         WHERE user_id = ? AND revoked_at IS NULL`,
        [userId],
      );
      await pool.execute(
        "UPDATE user_sessions SET revoked_at = UTC_TIMESTAMP(3) WHERE user_id = ? AND revoked_at IS NULL",
        [userId],
      );
      await pool.execute("UPDATE users SET is_active = 0 WHERE id = ?", [
        userId,
      ]);
    }
    await pool.end();
  }
});
