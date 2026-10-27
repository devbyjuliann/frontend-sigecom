import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const administratorEmail = "frontend-e2e-admin@sigecom.invalid";
const sellerEmail = "frontend-e2e-category-seller@sigecom.invalid";
const password = process.env.SIGECOM_E2E_PASSWORD;
const screenshotDirectory = join(tmpdir(), "opencode", "sigecom-2.5-dashboard");

async function signIn(page, email = administratorEmail) {
  await page.goto("/ingresar");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByRole("textbox", { name: "Contraseña" }).fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/inicio$/);
}

test("dashboard shows authorized real data and adapts to required viewports", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await signIn(page);
  await expect(
    page.getByRole("heading", { name: /Administrador de pruebas/, level: 2 }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Accesos directos autorizados" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Métricas aún no disponibles" }),
  ).toBeVisible();
  await expect(page.getByText(/ventas y compras/i)).toBeVisible();
  await expect(page.getByText(/movimientos y valorización/i)).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Accesos directos autorizados" })
      .getByRole("link", { name: "Productos", exact: true }),
  ).toHaveAttribute("href", "/productos");
  await expect(
    page
      .getByRole("navigation", { name: "Accesos directos autorizados" })
      .getByRole("link", { name: "Mi perfil", exact: true }),
  ).toHaveAttribute("href", "/perfil");

  const dashboardResponse = await page.request.get("/api/v1/dashboard");
  expect(dashboardResponse.ok()).toBe(true);
  expect(dashboardResponse.headers()["cache-control"]).toContain("no-store");
  const dashboard = await dashboardResponse.json();
  expect(dashboard.indicators.activeProducts.available).toBe(true);
  expect(typeof dashboard.indicators.activeProducts.value).toBe("number");
  expect(dashboard).not.toHaveProperty("sales");
  expect(dashboard).not.toHaveProperty("recentActivity");

  await mkdir(screenshotDirectory, { recursive: true });
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(
      page.getByRole("heading", { name: /Administrador de pruebas/ }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: join(
        screenshotDirectory,
        `dashboard-${viewport.width}x${viewport.height}.png`,
      ),
      fullPage: true,
    });
  }
});

test("seller dashboard limits shortcuts and indicators to role permissions", async ({
  page,
}) => {
  await signIn(page, sellerEmail);
  await expect(
    page.getByRole("heading", {
      name: /Vendedor de categorías de prueba/,
      level: 2,
    }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Accesos directos autorizados" })
      .getByRole("link", { name: "Productos", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Accesos directos autorizados" })
      .getByRole("link", { name: "Clientes", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Accesos directos autorizados" })
      .getByRole("link", { name: "Proveedores", exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("navigation", { name: "Accesos directos autorizados" })
      .getByRole("link", { name: "Bodegas", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Proveedores registrados")).toHaveCount(0);
  await expect(page.getByText("Bodegas asignadas")).toBeVisible();
});
