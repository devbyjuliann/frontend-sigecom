import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "@playwright/test";

const email = "frontend-e2e-admin@sigecom.invalid";
const password = process.env.SIGECOM_E2E_PASSWORD;
const screenshotDirectory = join(tmpdir(), "opencode", "sigecom-3.1-inventory");

test("administrator consults inventory and the responsive layout at four viewports", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/ingresar");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByRole("textbox", { name: "Contraseña" }).fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/inicio$/);
  await page
    .getByRole("navigation", { name: "Navegación principal" })
    .getByRole("link", { name: "Inventario", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Inventario", level: 2 }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "Por bodega" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    page.getByRole("tab", { name: "Totales autorizados" }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: /Movimientos/ })).toBeVisible();
  await expect(page.getByText("Cargando inventario…")).toBeHidden();

  await mkdir(screenshotDirectory, { recursive: true });
  for (const [name, width, height] of [
    ["desktop", 1440, 900],
    ["laptop", 1280, 720],
    ["tablet", 768, 1024],
    ["mobile", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(
      page.getByRole("heading", { name: "Inventario", level: 2 }),
    ).toBeVisible();
    await expect(page.getByText("Cargando inventario…")).toBeHidden();
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
    }));
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
    await page.screenshot({
      path: join(screenshotDirectory, `${name}.png`),
      fullPage: true,
    });
  }
});
