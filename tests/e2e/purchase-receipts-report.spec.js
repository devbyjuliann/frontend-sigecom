import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const password = process.env.SIGECOM_E2E_PASSWORD;
const screenshotDirectory = join(tmpdir(), "opencode", "sigecom-6.3b3-visual");

async function signIn(page, email) {
  const csrfResponse = await page.request.get("/api/v1/auth/csrf");
  const { csrfToken } = await csrfResponse.json();
  const login = await page.request.post("/api/v1/auth/login", {
    headers: {
      Origin: "http://127.0.0.1:5174",
      "X-CSRF-Token": csrfToken,
    },
    data: { email, password },
  });
  expect(login.status()).toBe(200);
}

test("administrator switches reports and queries only the selected purchase report", async ({
  page,
}) => {
  const requests = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/reports/"))
      requests.push(request.url());
  });
  await signIn(page, "frontend-e2e-admin@sigecom.invalid");
  await page.goto("/reportes");
  await expect(page.getByLabel("Tipo de reporte")).toHaveValue("sales");
  await expect(
    page.getByRole("heading", { name: "Actividad de Ventas", level: 2 }),
  ).toBeVisible();
  await expect
    .poll(() => requests.some((url) => url.includes("/sales-activity?")))
    .toBe(true);
  const salesRequestsBeforeSwitch = requests.filter((url) =>
    url.includes("/sales-activity"),
  ).length;
  await page.getByLabel("Tipo de reporte").selectOption("purchases");
  await expect(
    page.getByRole("heading", {
      name: "Recepciones y Devoluciones de Compras",
      level: 2,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Desde")).toBeVisible();
  await expect(page.getByLabel("Hasta")).toBeVisible();
  await expect(page.getByLabel("Bodega", { exact: true })).toBeVisible();
  await expect(
    page.locator('[aria-label="Resumen del período"]'),
  ).toBeVisible();
  await expect
    .poll(() =>
      requests.some((url) => url.includes("/purchase-receipts/warehouses")),
    )
    .toBe(true);
  await expect
    .poll(() =>
      requests.some(
        (url) =>
          url.includes("/purchase-receipts?") ||
          url.includes("/purchase-receipts&"),
      ),
    )
    .toBe(true);
  expect(
    requests.filter((url) => url.includes("/sales-activity")),
  ).toHaveLength(salesRequestsBeforeSwitch);

  await page.getByRole("button", { name: "Consultar" }).click();
  await expect(
    page.getByRole("heading", { name: "Actividades de Compras" }),
  ).toBeVisible();
  await mkdir(screenshotDirectory, { recursive: true });
  for (const [name, width, height] of [
    ["desktop-1440x900", 1440, 900],
    ["laptop-1280x720", 1280, 720],
    ["tablet-768x1024", 768, 1024],
    ["mobile-390x844", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({
      path: join(screenshotDirectory, `${name}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});

test("seller cannot access the report module even with a valid session", async ({
  page,
}) => {
  await signIn(page, "frontend-e2e@sigecom.invalid");
  await page.goto("/reportes");
  await expect(
    page.getByRole("heading", { name: "Acceso no autorizado" }),
  ).toBeVisible();
  await expect(page.getByLabel("Tipo de reporte")).toHaveCount(0);
});

test("auditor can select and load the purchase report", async ({ page }) => {
  const purchaseRequests = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/reports/purchase-receipts")) {
      purchaseRequests.push(request.url());
    }
  });
  await signIn(page, "frontend-e2e-auditor@sigecom.invalid");
  await page.goto("/reportes");
  const selector = page.getByLabel("Tipo de reporte");
  await expect(selector).toBeVisible();
  await expect(
    page.getByRole("option", { name: "Recepciones y Devoluciones de Compras" }),
  ).toBeAttached();
  await selector.focus();
  await expect(selector).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(selector).toHaveValue("purchases");
  await expect(
    page.getByRole("heading", {
      name: "Recepciones y Devoluciones de Compras",
      level: 2,
    }),
  ).toBeVisible();
  await expect
    .poll(() =>
      purchaseRequests.some((url) => url.includes("/purchase-receipts?")),
    )
    .toBe(true);
});
