import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { revokeH2E2EFixtureDashboardPermission } from "../../../backend-sigecom/scripts/h2-e2e/fixtures.js";

const fixtures = JSON.parse(process.env.SIGECOM_H2_E2E_FIXTURES_JSON || "null");
const password = process.env.SIGECOM_H2_E2E_FIXTURE_PASSWORD;
const resultsDirectory = process.env.SIGECOM_H2_E2E_RESULTS_DIR;
let csrfToken = "";

async function signIn(page, email) {
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByRole("textbox", { name: "Contraseña" }).fill(password);
  const [response] = await Promise.all([
    page.waitForResponse((candidate) =>
      candidate.url().endsWith("/api/v1/auth/login"),
    ),
    page.getByRole("button", { name: "Ingresar" }).click(),
  ]);
  expect(response.status()).toBe(200);
  csrfToken = (await response.json()).csrfToken;
  await expect(page).toHaveURL(/\/inicio$/);
}

test("authenticated commercial flow populates dashboard, report and scoped identity", async ({
  page,
}) => {
  const runtimeErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  expect(fixtures?.runId).toMatch(/^[a-f0-9]{12}$/);
  expect(password).toBeTruthy();
  expect(resultsDirectory).toBeTruthy();

  await page.goto("/ingresar");
  await expect(
    page.getByRole("heading", { name: "Iniciar sesión" }),
  ).toBeVisible();
  await signIn(page, fixtures.userAEmail);
  await expect(
    page.getByRole("heading", { level: 2 }),
    `Runtime errors: ${runtimeErrors.join(" | ")}; body: ${await page.locator("body").innerText()}`,
  ).toContainText(`${fixtures.marker} administrador A`);

  const api = async (method, path, body, idempotencyKey) =>
    page.evaluate(
      async ({ method, path, body, idempotencyKey, csrfToken }) => {
        const headers = { Accept: "application/json" };
        if (body !== undefined) {
          headers["Content-Type"] = "application/json";
          headers["X-CSRF-Token"] = csrfToken;
        }
        if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
        const response = await fetch(path, {
          method,
          credentials: "include",
          headers,
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        const payload =
          response.status === 204
            ? null
            : await response.json().catch(() => null);
        return {
          status: response.status,
          payload,
          cacheControl: response.headers.get("cache-control"),
        };
      },
      { method, path, body, idempotencyKey, csrfToken },
    );

  await page.goto("/compras/nueva");
  await page
    .getByRole("combobox", { name: "Proveedor", exact: true })
    .selectOption(fixtures.supplierId);
  await page.getByLabel("Bodega destino").selectOption(fixtures.warehouseAId);
  await page
    .getByLabel("Referencia del proveedor")
    .fill(`${fixtures.marker}-purchase-${fixtures.runId}`);
  await page
    .getByLabel("Notas")
    .fill(`${fixtures.marker}-purchase-${fixtures.runId}`);
  await page
    .getByLabel("Agregar producto activo")
    .fill(`${fixtures.marker}-SKU`);
  await page
    .getByRole("button", { name: new RegExp(`${fixtures.marker} Producto`) })
    .click();
  await page.getByLabel(`Cantidad de ${fixtures.marker} Producto`).fill("12");
  await page
    .getByLabel(`Costo unitario de ${fixtures.marker} Producto`)
    .fill("7.00");
  const [orderResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v1/purchase-orders") &&
        response.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Guardar borrador" }).click(),
  ]);
  expect(orderResponse.status()).toBe(201);
  const order = await orderResponse.json();
  await expect(page).toHaveURL(new RegExp(`/compras/${order.id}$`));
  await expect(page.locator(".purchase-total-row strong").first()).toHaveText(
    "$ 84,00",
  );

  await page.getByRole("button", { name: "Revisar y confirmar" }).click();
  const [confirmationResponse] = await Promise.all([
    page.waitForResponse((response) =>
      response
        .url()
        .endsWith(`/api/v1/purchase-orders/${order.id}/confirmation`),
    ),
    page.getByRole("button", { name: "Confirmar orden" }).click(),
  ]);
  expect(confirmationResponse.status()).toBe(200);
  const confirmedOrder = await confirmationResponse.json();
  expect(confirmedOrder.status).toBe("confirmed");
  await expect(
    page.getByRole("button", { name: "Registrar recepción" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Registrar recepción" }).click();
  await page
    .getByLabel("Referencia de entrega *")
    .fill(`${fixtures.marker}-receipt-${fixtures.runId}`);
  await page.getByRole("button", { name: "Completar pendientes" }).click();
  const [receiptResponse] = await Promise.all([
    page.waitForResponse((response) =>
      response.url().endsWith(`/api/v1/purchase-orders/${order.id}/receipts`),
    ),
    (async () => {
      await page.getByRole("button", { name: "Revisar recepción" }).click();
      await page.getByRole("button", { name: "Confirmar recepción" }).click();
    })(),
  ]);
  expect(receiptResponse.status()).toBe(201);
  const receipt = await receiptResponse.json();
  expect(receipt.lines[0].quantity).toBe(12);
  await expect(
    page.getByText("Recepción confirmada y existencias actualizadas."),
  ).toBeVisible();

  await page
    .locator(".purchase-receipt-entry summary")
    .filter({ hasText: `${fixtures.marker}-receipt-${fixtures.runId}` })
    .click();
  await page.getByRole("button", { name: "Devolver mercancía" }).click();
  await page
    .getByLabel("Referencia de devolución")
    .fill(`${fixtures.marker}-supplier-return-${fixtures.runId}`);
  await page
    .getByLabel("Motivo", { exact: true })
    .fill("Devolución sintética controlada para E2E.");
  await page
    .getByLabel(`Cantidad a devolver de ${fixtures.marker} Producto`)
    .fill("1");
  const [supplierReturnResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response
          .url()
          .includes(`/api/v1/purchase-orders/${order.id}/receipts/`) &&
        response.url().endsWith("/returns"),
    ),
    (async () => {
      await page.getByRole("button", { name: "Revisar devolución" }).click();
      await page.getByRole("button", { name: "Confirmar devolución" }).click();
    })(),
  ]);
  expect(supplierReturnResponse.status()).toBe(201);
  const supplierReturn = await supplierReturnResponse.json();
  expect(supplierReturn.lines[0].quantity).toBe(1);

  await page.goto("/ventas/nueva");
  await page
    .getByRole("combobox", { name: "Cliente", exact: true })
    .selectOption(fixtures.customerId);
  await page
    .getByLabel("Bodega", { exact: true })
    .selectOption(fixtures.warehouseAId);
  await page
    .getByLabel("Notas")
    .fill(`${fixtures.marker}-sale-${fixtures.runId}`);
  await page
    .getByLabel("Agregar producto activo")
    .fill(`${fixtures.marker}-SKU`);
  await page
    .getByRole("button", { name: new RegExp(`${fixtures.marker} Producto`) })
    .click();
  await page.getByLabel(`Cantidad de ${fixtures.marker} Producto`).fill("5");
  const [saleResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v1/sales") &&
        response.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Guardar borrador" }).click(),
  ]);
  expect(saleResponse.status()).toBe(201);
  const sale = await saleResponse.json();
  await expect(page).toHaveURL(new RegExp(`/ventas/${sale.id}$`));
  await expect(page.locator(".purchase-summary").last()).toContainText(
    "$ 100,00",
  );
  await page.getByRole("button", { name: "Confirmar venta" }).click();
  const [saleConfirmation] = await Promise.all([
    page.waitForResponse((response) =>
      response.url().endsWith(`/api/v1/sales/${sale.id}/confirmation`),
    ),
    page
      .getByRole("button", { name: "Confirmar y descontar existencias" })
      .click(),
  ]);
  expect(saleConfirmation.status()).toBe(200);
  const confirmedSale = await saleConfirmation.json();
  expect(confirmedSale.status).toBe("confirmed");

  await page.getByRole("button", { name: "Registrar devolución" }).click();
  await page
    .getByLabel("Referencia", { exact: true })
    .fill(`${fixtures.marker}-customer-return-${fixtures.runId}`);
  await page
    .getByLabel("Motivo comercial")
    .fill("Devolución sintética inspeccionada para E2E.");
  await page
    .getByLabel("Observación de recepción e inspección")
    .fill("Conteo físico de una unidad recibida y revisada.");
  await page
    .getByLabel(`Seleccionar ${fixtures.marker} Producto para devolución`)
    .check();
  await page
    .getByLabel(`Cantidad recibida ahora: ${fixtures.marker} Producto`)
    .fill("1");
  await page
    .getByLabel(`Cantidad apta para reintegrar: ${fixtures.marker} Producto`)
    .fill("1");
  await page
    .getByLabel("Declaro que recibí físicamente las cantidades indicadas")
    .check();
  await page
    .getByLabel("Declaro que inspeccioné la mercancía y clasifiqué su aptitud")
    .check();
  const [customerReturn] = await Promise.all([
    page.waitForResponse((response) =>
      response.url().endsWith(`/api/v1/sales/${sale.id}/returns`),
    ),
    (async () => {
      await page.getByRole("button", { name: "Revisar devolución" }).click();
      await page
        .getByRole("button", { name: "Confirmar devolución definitiva" })
        .click();
    })(),
  ]);
  expect(customerReturn.status()).toBe(201);
  const customerReturnPayload = await customerReturn.json();
  expect(customerReturnPayload.customerReturn.lines[0].quantityRestocked).toBe(
    1,
  );

  await page.goto("/ventas/nueva");
  await page
    .getByRole("combobox", { name: "Cliente", exact: true })
    .selectOption(fixtures.customerId);
  await page
    .getByLabel("Bodega", { exact: true })
    .selectOption(fixtures.warehouseAId);
  await page
    .getByLabel("Notas")
    .fill(`${fixtures.marker}-cancelled-sale-${fixtures.runId}`);
  await page
    .getByLabel("Agregar producto activo")
    .fill(`${fixtures.marker}-SKU`);
  await page
    .getByRole("button", { name: new RegExp(`${fixtures.marker} Producto`) })
    .click();
  await page.getByLabel(`Cantidad de ${fixtures.marker} Producto`).fill("2");
  const [cancelledSaleResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v1/sales") &&
        response.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Guardar borrador" }).click(),
  ]);
  expect(cancelledSaleResponse.status()).toBe(201);
  const cancelledSale = await cancelledSaleResponse.json();
  await page.getByRole("button", { name: "Confirmar venta" }).click();
  const [cancelledSaleConfirmation] = await Promise.all([
    page.waitForResponse((response) =>
      response.url().endsWith(`/api/v1/sales/${cancelledSale.id}/confirmation`),
    ),
    page
      .getByRole("button", { name: "Confirmar y descontar existencias" })
      .click(),
  ]);
  expect(cancelledSaleConfirmation.status()).toBe(200);
  const confirmedCancelledSale = await cancelledSaleConfirmation.json();
  expect(confirmedCancelledSale.status).toBe("confirmed");
  await page.getByRole("button", { name: "Anular venta" }).click();
  await page
    .getByLabel("Motivo de anulación")
    .fill("La mercancía no se despachó y fue verificada en bodega.");
  await page
    .getByLabel("Referencia de verificación física")
    .fill(`${fixtures.marker}-sale-reversal-${fixtures.runId}`);
  await page
    .getByLabel("Observaciones de la comprobación")
    .fill("Conteo físico cotejado contra las dos unidades.");
  await page
    .getByLabel("Declaro que la mercancía nunca salió físicamente de la bodega")
    .check();
  await page
    .getByLabel("Declaro que todas las cantidades originales están completas")
    .check();
  await page
    .getByLabel("Declaro que todos los productos permanecen aptos para vender")
    .check();
  const [reversal] = await Promise.all([
    page.waitForResponse((response) =>
      response.url().endsWith(`/api/v1/sales/${cancelledSale.id}/reversal`),
    ),
    (async () => {
      await page.getByRole("button", { name: "Revisar anulación" }).click();
      await page
        .getByRole("button", { name: "Anular y reintegrar existencias" })
        .click();
    })(),
  ]);
  expect(reversal.status()).toBe(200);
  const reversalPayload = await reversal.json();
  expect(reversalPayload.sale.status).toBe("cancelled");

  const [reversalPdf] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Descargar comprobante PDF" }).click(),
  ]);
  const pdfPath = join(resultsDirectory, "sale-reversal.pdf");
  await reversalPdf.saveAs(pdfPath);
  expect((await readFile(pdfPath)).toString("latin1")).toMatch(
    /^%PDF-1\.[0-9]/,
  );

  const dashboardResponse = await api("GET", "/api/v1/dashboard");
  expect(dashboardResponse.status).toBe(200);
  expect(dashboardResponse.cacheControl).toContain("no-store");
  const dashboard = dashboardResponse.payload;
  expect(dashboard.commercial.salesNet.value).toBe("80.00");
  expect(dashboard.commercial.purchasesReceived.value).toBe("84.00");
  expect(dashboard.commercial.period.timeZone).toBe("America/Bogota");
  expect(dashboard.commercial.period.dateFrom <= fixtures.today).toBe(true);
  expect(dashboard.commercial.period.dateTo >= fixtures.today).toBe(true);
  expect(dashboard.commercial.lowStockProducts.value).toBeGreaterThanOrEqual(1);
  expect(dashboard.commercial.topProducts.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        productId: fixtures.productId,
        quantity: "4",
        amount: "80.00",
      }),
    ]),
  );
  expect(dashboard.commercial.recentActivity.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: "purchase_receipt", amount: "84.00" }),
      expect.objectContaining({ type: "supplier_return", amount: "7.00" }),
      expect.objectContaining({ type: "sale_confirmation", amount: "100.00" }),
      expect.objectContaining({ type: "sale_cancellation", amount: "40.00" }),
      expect.objectContaining({ type: "customer_return", amount: "20.00" }),
    ]),
  );
  expect(dashboard.commercial.inventoryByWarehouse.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        warehouseId: fixtures.warehouseAId,
        stockedProducts: 1,
        stockedPairs: 1,
      }),
    ]),
  );

  const balances = await api(
    "GET",
    `/api/v1/inventory/balances?warehouseId=${fixtures.warehouseAId}&q=${encodeURIComponent(fixtures.marker)}`,
  );
  expect(balances.status).toBe(200);
  expect(balances.payload.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        productId: fixtures.productId,
        warehouseId: fixtures.warehouseAId,
        quantity: 7,
      }),
    ]),
  );
  const movementResponse = await api(
    "GET",
    `/api/v1/inventory/movements?warehouseId=${fixtures.warehouseAId}&productId=${fixtures.productId}&pageSize=100&sortBy=createdAt&sortOrder=asc`,
  );
  expect(movementResponse.status).toBe(200);
  const movements = [...movementResponse.payload.items].sort(
    (first, second) =>
      Number(first.balanceVersion) - Number(second.balanceVersion),
  );
  expect(movements).toHaveLength(6);
  expect(
    movements.map(
      ({ operationType, direction, quantity, balanceBefore, balanceAfter }) => [
        operationType,
        direction,
        quantity,
        balanceBefore,
        balanceAfter,
      ],
    ),
  ).toEqual([
    ["purchase_receipt", "IN", 12, 0, 12],
    ["supplier_return", "OUT", 1, 12, 11],
    ["sale_issue", "OUT", 5, 11, 6],
    ["customer_return", "IN", 1, 6, 7],
    ["sale_issue", "OUT", 2, 7, 5],
    ["sale_reversal", "IN", 2, 5, 7],
  ]);

  await page.goto("/inicio");
  await expect(page.getByRole("heading", { level: 2 })).toContainText(
    `${fixtures.marker} administrador A`,
  );
  await expect(page.getByText(`${fixtures.marker} Producto`)).toBeVisible();
  const renderedMetrics = await page
    .getByLabel("Indicadores comerciales autorizados")
    .innerText();
  expect(renderedMetrics).toContain("80,00");
  expect(renderedMetrics).toContain("84,00");

  await expect(page.getByText("Tendencia de ventas")).toBeVisible();
  await expect(page.getByText("Productos más vendidos")).toBeVisible();
  await expect(page.getByText("Inventario por bodega")).toBeVisible();

  await mkdir(join(resultsDirectory, "visual"), { recursive: true });
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole("heading", { level: 2 })).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
    await page.screenshot({
      path: join(
        resultsDirectory,
        "visual",
        `dashboard-${viewport.width}x${viewport.height}.png`,
      ),
      fullPage: true,
    });
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/reportes");
  await expect(
    page.getByRole("heading", { name: "Actividad de Ventas", level: 2 }),
  ).toBeVisible();
  const reportResponse = await api(
    "GET",
    `/api/v1/reports/sales-activity?dateFrom=${fixtures.today.slice(0, 7)}-01&dateTo=${fixtures.today}`,
  );
  expect(reportResponse.status).toBe(200);
  expect(reportResponse.cacheControl).toContain("no-store");
  expect(reportResponse.payload.activities).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: "sale_confirmation", amount: "100.00" }),
      expect.objectContaining({ type: "sale_cancellation", amount: "40.00" }),
      expect.objectContaining({ type: "customer_return", amount: "20.00" }),
    ]),
  );
  expect(reportResponse.payload.summary).toMatchObject({
    grossConfirmed: "140.00",
    cancellations: "40.00",
    returnEquivalent: "20.00",
    referenceCommercialBalance: "80.00",
  });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar resultados (CSV)" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(
    /^actividad-ventas-completa-\d{4}-\d{2}-\d{2}\.csv$/,
  );
  const csvPath = join(resultsDirectory, "sales-activity.csv");
  await download.saveAs(csvPath);
  const csv = await readFile(csvPath, "utf8");
  expect(csv).toContain("100.00");
  expect(csv).toContain("40.00");
  expect(csv).toContain("20.00");
  expect(csv).toContain(fixtures.marker);

  await page.goto("/inventario");
  await page.getByRole("tab", { name: "Por bodega" }).click();
  const stockRow = page
    .getByRole("row")
    .filter({ hasText: `${fixtures.marker} Producto` });
  await expect(stockRow).toContainText("7");
  await page.getByRole("tab", { name: "Movimientos" }).click();
  await page.getByLabel("Buscar inventario").fill(`${fixtures.marker}-SKU`);
  await page.getByRole("button", { name: "Buscar" }).click();
  const movementPanel = page.getByRole("tabpanel");
  await expect(movementPanel).toContainText("Recepción de compra");
  await expect(movementPanel).toContainText("Devolución a proveedor");
  await expect(movementPanel).toContainText("Salida por venta");
  await expect(movementPanel).toContainText("Devolución de cliente");
  await expect(movementPanel).toContainText("Anulación de venta");

  await page.goto("/auditoria");
  await expect(
    page.locator("#contenido-principal").getByRole("heading", {
      name: "Auditoría",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Eventos de auditoría" }),
  ).toContainText("Recepción de mercancía");
  await expect(
    page.getByRole("region", { name: "Eventos de auditoría" }),
  ).toContainText("Devolución a proveedor");
  await expect(
    page.getByRole("region", { name: "Eventos de auditoría" }),
  ).toContainText("Venta confirmada");

  await page.goto("/productos");
  await expect(
    page.locator("#contenido-principal").getByRole("heading", {
      name: "Productos",
    }),
  ).toBeVisible();
  await expect(page.getByText(`${fixtures.marker} Producto`)).toBeVisible();
  await page
    .getByRole("button", { name: `Editar ${fixtures.marker}-SKU` })
    .click();
  await page
    .getByLabel("Descripción")
    .fill("Actualización de ficha validada desde la interfaz H2.");
  const [productUpdate] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes(`/api/v1/products/${fixtures.productId}`) &&
        response.request().method() === "PATCH",
    ),
    page.getByRole("button", { name: "Guardar cambios" }).click(),
  ]);
  expect(productUpdate.status()).toBe(200);

  await page.goto("/bodegas");
  await expect(
    page.locator("#contenido-principal").getByRole("heading", {
      name: "Bodegas",
    }),
  ).toBeVisible();
  await expect(page.getByText(`${fixtures.marker} Bodega A`)).toBeVisible();
  await page
    .getByRole("button", { name: `Editar bodega ${fixtures.marker}-A` })
    .click();
  await page
    .getByRole("textbox", { name: "Ubicación (opcional)" })
    .fill("Ubicación actualizada desde la interfaz H2.");
  const [warehouseUpdate] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response
          .url()
          .includes(`/api/v1/warehouses/${fixtures.warehouseAId}`) &&
        response.request().method() === "PATCH",
    ),
    page.getByRole("button", { name: "Guardar cambios" }).click(),
  ]);
  expect(warehouseUpdate.status()).toBe(200);

  await page.goto("/administracion/roles");
  await page.getByLabel("Rol", { exact: true }).selectOption("seller");
  await expect(
    page.locator(".roles-permissions-page").getByRole("heading", {
      name: "Roles y permisos",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: /^Consultar bodegas/ }),
  ).toBeChecked();

  await page.getByRole("button", { name: /Menú de usuario:/ }).click();
  await page.getByRole("menuitem", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/ingresar$/);
  await signIn(page, fixtures.userBEmail);

  const identity = await api("GET", "/api/v1/auth/me");
  expect(identity.status).toBe(200);
  expect(identity.payload.user.email).toBe(fixtures.userBEmail);
  const foreignSale = await api("GET", `/api/v1/sales/${sale.id}`);
  expect(foreignSale.status).toBe(404);
  const foreignWarehouse = await api(
    "GET",
    `/api/v1/inventory/balances?warehouseId=${fixtures.warehouseAId}`,
  );
  expect(foreignWarehouse.status).toBe(404);
  const deniedReport = await api(
    "GET",
    `/api/v1/reports/sales-activity?dateFrom=${fixtures.today.slice(0, 7)}-01&dateTo=${fixtures.today}`,
  );
  expect(deniedReport.status).toBe(403);

  await revokeH2E2EFixtureDashboardPermission();
  const revokedIdentity = await api("GET", "/api/v1/auth/me");
  expect(revokedIdentity.status).toBe(200);
  expect(revokedIdentity.payload.permissions).not.toContain("dashboard.read");
  const revokedDashboard = await api("GET", "/api/v1/dashboard");
  expect(revokedDashboard.status).toBe(403);
  await page.reload();
  await expect(page).toHaveURL(/\/acceso-denegado$/);

  const logoutResponse = await page.evaluate(async (token) => {
    const response = await fetch("/api/v1/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: { "X-CSRF-Token": token, Accept: "application/json" },
    });
    return response.status;
  }, csrfToken);
  expect(logoutResponse).toBe(204);
  const afterLogout = await api("GET", "/api/v1/auth/me");
  expect(afterLogout.status).toBe(401);
});
