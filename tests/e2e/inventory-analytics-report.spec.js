import { expect, test } from "@playwright/test";

const password = process.env.SIGECOM_E2E_PASSWORD;

async function signIn(page, email) {
  const csrfResponse = await page.request.get("/api/v1/auth/csrf");
  expect(csrfResponse.ok()).toBe(true);
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

test("administrator loads both authorized inventory views without duplicate requests", async ({
  page,
}, testInfo) => {
  const requests = [];
  const requestRecords = new Map();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/v1/reports/inventory/")) {
      const record = { path: url.pathname, search: url.search };
      requests.push(record);
      requestRecords.set(request, record);
    }
  });
  page.on("requestfinished", (request) => {
    const record = requestRecords.get(request);
    if (!record) return;
    const timing = request.timing();
    record.apiWallMs = Math.round(timing.responseEnd - timing.requestStart);
  });

  await signIn(page, "frontend-e2e-admin@sigecom.invalid");
  await page.goto("/reportes");
  await expect(page).toHaveURL(/\/reportes$/);
  await page
    .getByRole("combobox", { name: "Tipo de reporte" })
    .selectOption("inventory");
  await expect(
    page.getByRole("heading", {
      name: "Resumen de Inventario y Actividad de Bodega",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Vista de Inventario" }),
  ).toHaveValue("balances");
  await expect(
    page.getByRole("heading", { name: "Existencias por bodega y unidad" }),
  ).toBeVisible();
  await expect(page.getByText(/Generado/).first()).toBeVisible();
  await expect
    .poll(
      () => requests.filter(({ path }) => path.endsWith("/balances")).length,
    )
    .toBe(1);
  await expect
    .poll(
      () => requests.filter(({ path }) => path.endsWith("/warehouses")).length,
    )
    .toBe(1);

  await page
    .getByRole("combobox", { name: "Vista de Inventario" })
    .selectOption("movements");
  await expect(page.getByLabel("Desde")).toHaveValue(/\d{4}-\d{2}-\d{2}/);
  const selectedAt = Date.now();
  await expect(
    page.getByRole("region", { name: "Indicadores del resumen" }),
  ).toBeVisible();
  const selectedToDataMs = Date.now() - selectedAt;
  await expect(
    page.getByRole("heading", {
      name: "Actividad física por bodega, tipo y unidad",
    }),
  ).toBeVisible();
  await expect
    .poll(
      () => requests.filter(({ path }) => path.endsWith("/movements")).length,
    )
    .toBe(1);
  await expect
    .poll(
      () => requests.filter(({ path }) => path.endsWith("/warehouses")).length,
    )
    .toBe(2);
  expect(
    requests.some(
      ({ path, search }) =>
        path.endsWith("/movements") && /dateFrom=.*dateTo=/.test(search),
    ),
  ).toBe(true);
  console.log(
    "Inventory report request counts and wall times",
    JSON.stringify({ requests, selectedToDataMs }),
  );

  await page.getByLabel("Hasta").fill("2020-02-01");
  await page.getByRole("button", { name: "Consultar" }).click();
  await expect(page.getByRole("alert")).toContainText("fechas reales");
  expect(
    requests.filter(({ path }) => path.endsWith("/movements")),
  ).toHaveLength(1);

  const viewports = [
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ];
  for (const view of ["balances", "movements"]) {
    await page
      .getByRole("combobox", { name: "Vista de Inventario" })
      .selectOption(view);
    await expect(
      page.getByRole("heading", {
        name:
          view === "balances"
            ? "Existencias actuales verificables"
            : "Actividad física del período",
      }),
    ).toBeVisible();
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await expect(
        page.getByRole("combobox", { name: "Tipo de reporte" }),
      ).toBeVisible();
      const documentWidth = await page.evaluate(
        () => document.documentElement.scrollWidth,
      );
      expect(documentWidth).toBeLessThanOrEqual(viewport.width);
      await page.screenshot({
        path: testInfo.outputPath(
          `inventory-${view}-${viewport.width}x${viewport.height}.png`,
        ),
        fullPage: true,
      });
    }
  }
});

test("auditor can open the integrated inventory report through the real API", async ({
  page,
}) => {
  await signIn(page, "frontend-e2e-auditor@sigecom.invalid");
  await page.goto("/reportes");
  await page
    .getByRole("combobox", { name: "Tipo de reporte" })
    .selectOption("inventory");
  await expect(
    page.getByRole("heading", {
      name: "Resumen de Inventario y Actividad de Bodega",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Existencias por bodega y unidad" }),
  ).toBeVisible();
});

test("seller does not receive the inventory report option or an authorized report response", async ({
  page,
}) => {
  await signIn(page, "frontend-e2e@sigecom.invalid");
  await page.goto("/reportes");
  await expect(
    page.getByRole("heading", { name: "Acceso no autorizado" }),
  ).toBeVisible();
});
