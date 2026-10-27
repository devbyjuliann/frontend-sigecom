import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const administratorEmail = "frontend-e2e-admin@sigecom.invalid";
const sellerEmail = "frontend-e2e-category-seller@sigecom.invalid";
const password = process.env.SIGECOM_E2E_PASSWORD;
const screenshotDirectory = join(tmpdir(), "opencode", "sigecom-2.2-visual");

async function signIn(page, email = administratorEmail) {
  await page.goto("/ingresar");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByRole("textbox", { name: "Contraseña" }).fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/inicio$/);
}

test("administrator manages warehouses with persisted details and responsive layout", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await signIn(page);
  await page.getByRole("link", { name: "Bodegas", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Bodegas", level: 2 }),
  ).toBeVisible();

  const suffix = Date.now().toString();
  const code = `E2E-${suffix}`;
  const originalName = `Bodega de prueba ${suffix}`;
  await page.getByRole("button", { name: "Nueva bodega" }).click();
  await page.getByLabel("Código", { exact: true }).fill(code.toLowerCase());
  await page.getByLabel("Nombre", { exact: true }).fill(originalName);
  await page
    .getByLabel("Ubicación (opcional)")
    .fill("Centro de distribución norte");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crear bodega" })
    .click();

  // The test database is intentionally persistent; locate this run's record
  // instead of assuming it fits on the first page after previous E2E runs.
  await page.getByRole("searchbox", { name: "Buscar bodegas" }).fill(suffix);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();

  await expect(
    page.getByRole("row", { name: new RegExp(`${code} ${originalName}`) }),
  ).toBeVisible();
  await page.getByRole("button", { name: `Ver bodega ${code}` }).click();
  await expect(
    page.getByRole("dialog", { name: "Detalle de bodega" }),
  ).toContainText("Centro de distribución norte");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cerrar" })
    .click();

  await page.reload();
  await expect(
    page.getByRole("row", { name: new RegExp(`${code} ${originalName}`) }),
  ).toBeVisible();
  await page.getByRole("button", { name: `Editar bodega ${code}` }).click();
  const updatedName = `${originalName} editada`;
  await page.getByLabel("Nombre", { exact: true }).fill(updatedName);
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(
    page.getByRole("row", { name: new RegExp(`${code} ${updatedName}`) }),
  ).toBeVisible();

  await page.getByRole("button", { name: `Desactivar bodega ${code}` }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Desactivar" })
    .click();
  await page.locator("#warehouse-status-filter").selectOption("inactive");
  await expect(
    page.getByRole("row", { name: new RegExp(`${code} ${updatedName}`) }),
  ).toBeVisible();

  await page.getByRole("button", { name: `Activar bodega ${code}` }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Activar" })
    .click();
  await page.locator("#warehouse-status-filter").selectOption("active");
  await expect(
    page.getByRole("row", { name: new RegExp(`${code} ${updatedName}`) }),
  ).toBeVisible();
  await page.getByRole("searchbox", { name: "Buscar bodegas" }).fill(suffix);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(
    page.getByRole("row", { name: new RegExp(`${code} ${updatedName}`) }),
  ).toBeVisible();
  await page.getByRole("searchbox", { name: "Buscar bodegas" }).fill("");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page.getByText("Bodega activada.")).toBeHidden();

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
        `bodegas-${viewport.width}x${viewport.height}.png`,
      ),
      fullPage: true,
    });
  }
});

test("non-administrator cannot change warehouse data through the UI or API", async ({
  page,
}) => {
  await signIn(page, sellerEmail);
  await page.goto("/bodegas");
  await expect(
    page.getByRole("heading", { name: "Bodegas", level: 2 }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Nueva bodega" })).toHaveCount(
    0,
  );

  const response = await page.request.post("/api/v1/warehouses", {
    data: { code: `DEN-${Date.now()}`, name: "No autorizada" },
    headers: {
      Origin: "http://127.0.0.1:5174",
      "X-CSRF-Token": await page.evaluate(
        () =>
          document.cookie
            .split("; ")
            .find((cookie) => cookie.startsWith("sigecom_csrf="))
            ?.split("=")[1],
      ),
    },
  });
  expect(response.status()).toBe(403);
});
