import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "@playwright/test";

const administratorEmail = "frontend-e2e-admin@sigecom.invalid";
const sellerEmail = "frontend-e2e-category-seller@sigecom.invalid";
const auditorEmail = "frontend-e2e-auditor@sigecom.invalid";
const password = process.env.SIGECOM_E2E_PASSWORD;
const screenshotDirectory = join(tmpdir(), "opencode", "sigecom-2.4-visual");

async function signIn(page, email = administratorEmail) {
  await page.goto("/ingresar");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByRole("textbox", { name: "Contraseña" }).fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/inicio$/);
}

async function search(page, query) {
  await page
    .getByRole("searchbox", { name: /Buscar clientes|Buscar proveedores/ })
    .fill(query);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
}

async function waitForPartnerFeedback(page) {
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, {
    timeout: 12_000,
  });
}

async function capturePageStates(page, resourceSlug) {
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
    const suffix = `${viewport.width}x${viewport.height}`;
    await page.screenshot({
      path: join(screenshotDirectory, `${resourceSlug}-${suffix}.png`),
      fullPage: true,
    });
    await page
      .getByRole("button", {
        name: resourceSlug === "clientes" ? "Nuevo cliente" : "Nuevo proveedor",
      })
      .click();
    await page.screenshot({
      path: join(
        screenshotDirectory,
        `${resourceSlug}-formulario-${suffix}.png`,
      ),
      fullPage: true,
    });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancelar" })
      .click();
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

async function captureDetail(page, dialog, resourceSlug) {
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
    await expect(dialog).toBeVisible();
    await page.screenshot({
      path: join(
        screenshotDirectory,
        `${resourceSlug}-detalle-${viewport.width}x${viewport.height}.png`,
      ),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

test("administrator manages customers and suppliers and layouts remain responsive", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await signIn(page);
  const suffix = Date.now().toString();

  await page.getByRole("link", { name: "Clientes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Clientes", level: 2 }),
  ).toBeVisible();
  const customerId = `90.${suffix}-1`;
  const customerName = `Cliente E2E ${suffix}`;
  await page.getByRole("button", { name: "Nuevo cliente" }).click();
  await page.getByLabel("Número de identificación").fill(` 90.${suffix}-1 `);
  await page.locator("#partner-name").fill(customerName);
  await page
    .getByLabel("Correo electrónico")
    .fill(`cliente-${suffix}@example.com`);
  await page.getByRole("button", { name: "Crear cliente" }).click();
  await search(page, suffix);
  await expect(
    page.getByRole("row", { name: new RegExp(customerName) }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Ordenar por Identificación" })
    .click();
  await expect(page).toHaveURL(/sortBy=identification/);
  await page
    .getByRole("button", { name: "Ordenar por Identificación" })
    .click();
  await expect(page).toHaveURL(/sortOrder=desc/);
  const customerRow = page.getByRole("row", { name: new RegExp(customerName) });
  await customerRow
    .getByRole("button", { name: new RegExp(`Ver cliente ${customerId}`) })
    .click();
  const customerDialog = page.getByRole("dialog", {
    name: "Detalle del cliente",
  });
  await expect(customerDialog).toContainText(customerName);
  await captureDetail(page, customerDialog, "clientes");
  await customerDialog.getByRole("button", { name: "Cerrar" }).click();
  await customerRow
    .getByRole("button", { name: new RegExp(`Editar ${customerId}`) })
    .click();
  const updatedCustomerName = `${customerName} actualizado`;
  await page.locator("#partner-name").fill(updatedCustomerName);
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(
    page.getByRole("row", { name: new RegExp(updatedCustomerName) }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: new RegExp(`Desactivar ${customerId}`) })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Desactivar" })
    .click();
  await page.locator("#partners-status-filter").selectOption("inactive");
  await expect(
    page.getByRole("row", { name: new RegExp(updatedCustomerName) }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: new RegExp(`Activar ${customerId}`) })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Activar" })
    .click();
  await waitForPartnerFeedback(page);
  await page.locator("#partners-status-filter").selectOption("all");
  await capturePageStates(page, "clientes");
  await page.reload();
  await expect(
    page.getByRole("row", { name: new RegExp(updatedCustomerName) }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Proveedores", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Proveedores", level: 2 }),
  ).toBeVisible();
  const supplierId = `PROV-${suffix}`;
  const supplierName = `Suministros E2E ${suffix}`;
  await page.getByRole("button", { name: "Nuevo proveedor" }).click();
  await page.getByLabel("Número de identificación").fill(supplierId);
  await page.locator("#partner-name").fill(supplierName);
  await page.getByRole("button", { name: "Crear proveedor" }).click();
  await search(page, suffix);
  await expect(
    page.getByRole("row", { name: new RegExp(supplierName) }),
  ).toBeVisible();
  const supplierRow = page.getByRole("row", { name: new RegExp(supplierName) });
  await supplierRow
    .getByRole("button", { name: new RegExp(`Ver proveedor ${supplierId}`) })
    .click();
  const supplierDialog = page.getByRole("dialog", {
    name: "Detalle del proveedor",
  });
  await expect(supplierDialog).toContainText(supplierName);
  await expect(supplierDialog).toContainText("Sin teléfono registrado");
  await captureDetail(page, supplierDialog, "proveedores");
  await supplierDialog.getByRole("button", { name: "Cerrar" }).click();
  await supplierRow
    .getByRole("button", { name: new RegExp(`Editar ${supplierId}`) })
    .click();
  const updatedSupplierName = `${supplierName} actualizado`;
  await page.locator("#partner-name").fill(updatedSupplierName);
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(
    page.getByRole("row", { name: new RegExp(updatedSupplierName) }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: new RegExp(`Desactivar ${supplierId}`) })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Desactivar" })
    .click();
  await page.locator("#partners-status-filter").selectOption("inactive");
  await expect(
    page.getByRole("row", { name: new RegExp(updatedSupplierName) }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: new RegExp(`Activar ${supplierId}`) })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Activar" })
    .click();
  await waitForPartnerFeedback(page);
  await page.locator("#partners-status-filter").selectOption("all");
  await capturePageStates(page, "proveedores");
  await page.reload();
  await expect(
    page.getByRole("row", { name: new RegExp(updatedSupplierName) }),
  ).toBeVisible();
});

test("seller can manage customers but has no supplier access", async ({
  page,
}) => {
  await signIn(page, sellerEmail);
  await page.goto("/clientes");
  await expect(
    page.getByRole("heading", { name: "Clientes", level: 2 }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Nuevo cliente" }),
  ).toBeVisible();
  await page.goto("/proveedores");
  await expect(page).toHaveURL(/\/acceso-denegado$/);
});

test("auditor can consult both directories without mutation controls", async ({
  page,
}) => {
  await signIn(page, auditorEmail);
  await page.goto("/clientes");
  await expect(
    page.getByRole("heading", { name: "Clientes", level: 2 }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Nuevo cliente" })).toHaveCount(
    0,
  );
  await page.goto("/proveedores");
  await expect(
    page.getByRole("heading", { name: "Proveedores", level: 2 }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Nuevo proveedor" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Editar/ })).toHaveCount(0);
});
