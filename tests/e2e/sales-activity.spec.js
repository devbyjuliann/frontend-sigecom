import { expect, test } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

const password = process.env.SIGECOM_E2E_PASSWORD;

async function signIn(page, email) {
  await page.goto("/ingresar");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByRole("textbox", { name: "Contraseña" }).fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL(/\/(inicio|acceso-denegado)$/);
}

test("Administrador consulta Actividad de Ventas mediante los endpoints reales", async ({
  page,
}) => {
  await signIn(page, "frontend-e2e-admin@sigecom.invalid");
  await expect(page).toHaveURL(/\/inicio$/);
  await page.getByRole("link", { name: "Reportes", exact: true }).click();
  await expect(page).toHaveURL(/\/reportes$/);
  await expect(
    page.getByRole("heading", { name: "Actividad de Ventas" }).first(),
  ).toBeVisible();
  await expect(page.getByLabel("Desde")).toHaveValue(/\d{4}-\d{2}-\d{2}/);
  await expect(page.getByLabel("Hasta")).toHaveValue(/\d{4}-\d{2}-\d{2}/);
  await expect(page.getByLabel("Bodega", { exact: true })).toContainText(
    "Todas mis bodegas",
  );
  await expect(
    page.getByRole("heading", { name: "Hechos comerciales" }),
  ).toBeVisible();

  const reportRequests = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .map(({ name }) => name)
      .filter((name) => name.includes("/api/v1/reports/sales-activity")),
  );
  expect(reportRequests.some((url) => url.includes("/warehouses?"))).toBe(true);
  expect(reportRequests.some((url) => !url.includes("/warehouses?"))).toBe(
    true,
  );
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
});

test("Auditor puede consultar Actividad de Ventas", async ({ page }) => {
  await signIn(page, "frontend-e2e-auditor@sigecom.invalid");
  await page.goto("/reportes");
  await expect(
    page.getByRole("heading", { name: "Hechos comerciales" }),
  ).toBeVisible();
});

test("Vendedor no ve ni abre el reporte", async ({ page }) => {
  await signIn(page, "frontend-e2e@sigecom.invalid");
  await expect(
    page.getByRole("link", { name: "Reportes", exact: true }),
  ).toHaveCount(0);
  await page.goto("/reportes");
  await expect(page).toHaveURL(/\/acceso-denegado$/);
});

test("la pantalla mantiene legibilidad y no desborda en las cuatro resoluciones objetivo", async ({
  page,
}) => {
  await signIn(page, "frontend-e2e-admin@sigecom.invalid");
  await page.goto("/reportes");
  await expect(
    page.getByRole("heading", { name: "Hechos comerciales" }),
  ).toBeVisible();

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(
      page.getByRole("heading", { name: "Actividad de Ventas" }).first(),
    ).toBeVisible();
    await page.screenshot({
      path: join(
        tmpdir(),
        "opencode",
        `sigecom-sales-activity-${viewport.width}x${viewport.height}.png`,
      ),
      fullPage: true,
    });
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      main: document.querySelector("#contenido-principal")?.scrollWidth,
      mainClient: document.querySelector("#contenido-principal")?.clientWidth,
    }));
    expect(
      dimensions.document,
      `document overflow at ${viewport.width}×${viewport.height}`,
    ).toBeLessThanOrEqual(dimensions.viewport);
    expect(
      dimensions.main,
      `main overflow at ${viewport.width}×${viewport.height}`,
    ).toBeLessThanOrEqual(dimensions.mainClient);
  }
});
