import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const administratorEmail = "frontend-e2e-admin@sigecom.invalid";
const sellerEmail = "frontend-e2e-category-seller@sigecom.invalid";
const password = process.env.SIGECOM_E2E_PASSWORD;
const screenshotDirectory = join(tmpdir(), "opencode", "sigecom-2.5-dashboard");
const visualDashboardBase = {
  indicators: {
    activeProducts: { available: true, value: 0 },
    customers: { available: true, value: 0 },
    suppliers: { available: true, value: 0 },
    accessibleWarehouses: { available: true, value: 0 },
  },
};
const dashboardVisualFixture = {
  ...visualDashboardBase,
  indicators: {
    activeProducts: { available: true, value: 25 },
    customers: { available: true, value: 8 },
    suppliers: { available: true, value: 4 },
    accessibleWarehouses: { available: true, value: 2 },
  },
  productsByCategory: {
    available: true,
    // Fixture exclusively for browser screenshots; it never touches either database.
    items: [
      {
        categoryId: "fixture-5",
        categoryName: "Tornillería",
        activeProducts: 2,
      },
      {
        categoryId: "fixture-3",
        categoryName: "Seguridad industrial",
        activeProducts: 4,
      },
      {
        categoryId: "fixture-1",
        categoryName: "Herramientas eléctricas",
        activeProducts: 9,
      },
      {
        categoryId: "fixture-4",
        categoryName: "Accesorios eléctricos",
        activeProducts: 3,
      },
      {
        categoryId: "fixture-2",
        categoryName: "Aseo institucional",
        activeProducts: 7,
      },
    ],
  },
};
const largeCategoryFixture = {
  ...dashboardVisualFixture,
  indicators: {
    ...dashboardVisualFixture.indicators,
    activeProducts: { available: true, value: 78 },
  },
  productsByCategory: {
    available: true,
    items: Array.from({ length: 12 }, (_, index) => ({
      categoryId: `fixture-large-${index + 1}`,
      categoryName: `Categoría ${index + 1}`,
      activeProducts: index + 1,
    })),
  },
};
const largeWarehouseFixture = {
  ...dashboardVisualFixture,
  commercial: {
    inventoryByWarehouse: {
      available: true,
      items: Array.from({ length: 12 }, (_, index) => ({
        warehouseId: `fixture-warehouse-${index + 1}`,
        warehouseCode: `WH-${String(index + 1).padStart(2, "0")}`,
        warehouseName: `Bodega ${index + 1}`,
        stockedProducts: index + 1,
        stockedPairs: index + 1,
      })),
    },
  },
};

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
    page.getByText("Productos activos", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Tendencia de ventas" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Inventario por bodega" }),
  ).toBeVisible();
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
  await expect(
    page.getByText("Bodegas asignadas", { exact: true }),
  ).toBeVisible();
});

test("empty category state remains clear at the required viewports", async ({
  page,
}) => {
  await page.route("**/api/v1/dashboard", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...visualDashboardBase,
        indicators: {
          ...visualDashboardBase.indicators,
          activeProducts: { available: true, value: 0 },
        },
        productsByCategory: { available: true, items: [] },
      }),
    }),
  );
  await signIn(page);

  await expect(
    page.getByText("No hay productos activos para distribuir por categoría."),
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
        `dashboard-vacio-${viewport.width}x${viewport.height}.png`,
      ),
      fullPage: true,
    });
  }
});

test("category chart renders an isolated visual fixture responsively", async ({
  page,
}) => {
  await page.route("**/api/v1/dashboard", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(dashboardVisualFixture),
    }),
  );
  await signIn(page);

  await expect(
    page.getByText("25 productos activos · 5 categorías"),
  ).toBeVisible();
  const categoryValues = page.getByRole("list", {
    name: "Valores de productos por categoría",
  });
  await expect(categoryValues.locator("li").first()).toHaveText(
    "Herramientas eléctricas: 9 productos.",
  );
  await expect(categoryValues.locator("li").last()).toHaveText(
    "Tornillería: 2 productos.",
  );

  const chart = page.locator(".recharts-wrapper");
  await expect(chart).toBeVisible();
  const chartSvg = chart.locator("svg").first();
  await expect(chartSvg).toHaveAttribute("tabindex", "0");
  await chartSvg.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".recharts-tooltip-wrapper")).toContainText(
    "productos",
  );
  await page.locator(".recharts-bar-rectangle").first().hover();
  await expect(page.locator(".recharts-tooltip-wrapper")).toContainText(
    "9 productos",
  );
  await mkdir(screenshotDirectory, { recursive: true });
  await page.mouse.move(0, 0);

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
        `dashboard-fixture-${viewport.width}x${viewport.height}.png`,
      ),
      fullPage: true,
    });
  }
});

test("category chart summarizes the long tail for large real datasets", async ({
  page,
}) => {
  await page.route("**/api/v1/dashboard", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(largeCategoryFixture),
    }),
  );
  await signIn(page);

  await expect(
    page.getByText("78 productos activos · 12 categorías"),
  ).toBeVisible();
  const categoryValues = page.getByRole("list", {
    name: "Valores de productos por categoría",
  });
  await expect(categoryValues.locator("li")).toHaveCount(9);
  await expect(categoryValues.locator("li").first()).toHaveText(
    "Categoría 12: 12 productos.",
  );
  await expect(categoryValues.locator("li").last()).toHaveText(
    "Otras categorías (4): 10 productos.",
  );
});

test("warehouse chart stays compact while retaining every authorized detail", async ({
  page,
}) => {
  await page.route("**/api/v1/dashboard", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(largeWarehouseFixture),
    }),
  );
  await signIn(page);

  const warehousePanel = page.getByRole("region", {
    name: "Inventario por bodega",
  });
  await expect(warehousePanel.getByText(/Top 8 de 12 bodegas/)).toBeVisible();
  await expect(warehousePanel.locator(".recharts-bar-rectangle")).toHaveCount(
    8,
  );
  const warehouseDetails = warehousePanel.getByRole("list", {
    name: "Existencias autorizadas por bodega",
  });
  await expect(warehouseDetails.locator("li")).toHaveCount(12);
  await expect(warehouseDetails.locator("li").first()).toContainText("WH-01");
});
