import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "@playwright/test";

const administratorEmail = "frontend-e2e-admin@sigecom.invalid";
const sellerEmail = "frontend-e2e-category-seller@sigecom.invalid";
const password = process.env.SIGECOM_E2E_PASSWORD;
const screenshotDirectory = join(tmpdir(), "opencode", "sigecom-2.3-visual");
const origin = "http://127.0.0.1:5174";

async function signIn(page, email = administratorEmail) {
  await page.goto("/ingresar");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByRole("textbox", { name: "Contraseña" }).fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/inicio$/);
}

async function createFixture(page) {
  const csrfToken = (await page.context().cookies()).find(
    (cookie) => cookie.name === "sigecom_csrf",
  ).value;
  const headers = { Origin: origin, "X-CSRF-Token": csrfToken };
  const suffix = Date.now().toString();
  const categoryResponse = await page.request.post("/api/v1/categories", {
    data: { name: `Categoría producto ${suffix}` },
    headers,
  });
  expect(categoryResponse.status()).toBe(201);
  const category = await categoryResponse.json();
  const warehouseResponse = await page.request.post("/api/v1/warehouses", {
    data: { code: `PR-${suffix}`, name: `Bodega producto ${suffix}` },
    headers,
  });
  expect(warehouseResponse.status()).toBe(201);
  return { suffix, category };
}

test("administrator manages products and the interface adapts to required viewports", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signIn(page);
  const { suffix, category } = await createFixture(page);
  await page
    .getByRole("navigation", { name: "Navegación principal" })
    .getByRole("link", { name: "Productos", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Productos", level: 2 }),
  ).toBeVisible();

  const sku = `E2E-${suffix}`;
  const name = `Producto visual ${suffix}`;
  await page.getByRole("button", { name: "Nuevo producto" }).click();
  await page.getByLabel("SKU", { exact: true }).fill(sku.toLowerCase());
  await page.getByLabel("Nombre", { exact: true }).fill(name);
  await page.getByLabel("Categoría", { exact: true }).selectOption(category.id);
  await page.getByLabel("Precio de compra (COP)").fill("1250.50");
  await page.getByLabel("Precio de venta (COP)").fill("2400.00");
  await page.getByLabel("Stock mínimo (entero)").fill("3");
  await page.getByRole("button", { name: "Crear producto" }).click();
  await page
    .getByRole("searchbox", { name: "Buscar productos por nombre o SKU" })
    .fill(suffix);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(
    page.getByRole("row", { name: new RegExp(`${sku} ${name}`) }),
  ).toBeVisible();

  await page.getByRole("button", { name: `Ver producto ${sku}` }).click();
  const detailDialog = page.getByRole("dialog", {
    name: "Detalle del producto",
  });
  await expect(detailDialog).toContainText(name);
  await expect(detailDialog).toContainText("Sin saldo registrado");
  await expect(detailDialog).toContainText("Existencias por bodega");
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
        `producto-detalle-${viewport.width}x${viewport.height}.png`,
      ),
      fullPage: true,
    });
  }
  await detailDialog.getByRole("button", { name: "Cerrar" }).click();
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.getByRole("button", { name: `Editar ${sku}` }).click();
  const updatedName = `${name} editado`;
  await page.getByLabel("Nombre", { exact: true }).fill(updatedName);
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(
    page.getByRole("row", { name: new RegExp(`${sku} ${updatedName}`) }),
  ).toBeVisible();

  await page.getByRole("button", { name: `Desactivar ${sku}` }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Desactivar" })
    .click();
  await page.locator("#product-status-filter").selectOption("inactive");
  await expect(
    page.getByRole("row", { name: new RegExp(`${sku} ${updatedName}`) }),
  ).toBeVisible();
  await page.getByRole("button", { name: `Activar ${sku}` }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Activar" })
    .click();
  await page.locator("#product-status-filter").selectOption("active");
  await page
    .getByRole("searchbox", { name: "Buscar productos por nombre o SKU" })
    .fill(suffix);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(
    page.getByRole("row", { name: new RegExp(`${sku} ${updatedName}`) }),
  ).toBeVisible();
  await expect(page.getByText(/Producto (?:des)?activado\./)).toHaveCount(0);

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
        `productos-${viewport.width}x${viewport.height}.png`,
      ),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Nuevo producto" }).click();
    await page.screenshot({
      path: join(
        screenshotDirectory,
        `producto-formulario-${viewport.width}x${viewport.height}.png`,
      ),
      fullPage: true,
    });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancelar" })
      .click();
  }
});

test("read-only seller can consult products but cannot manage them", async ({
  page,
}) => {
  await signIn(page, sellerEmail);
  await page.goto("/productos");
  await expect(
    page.getByRole("heading", { name: "Productos", level: 2 }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Nuevo producto" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Editar/ })).toHaveCount(0);

  const csrfToken = (await page.context().cookies()).find(
    (cookie) => cookie.name === "sigecom_csrf",
  ).value;
  const response = await page.request.post("/api/v1/products", {
    data: { sku: `DEN-${Date.now()}`, name: "No autorizado" },
    headers: {
      Origin: origin,
      "X-CSRF-Token": csrfToken,
    },
  });
  expect(response.status()).toBe(403);
  expect((await response.json()).error.code).toBe("PERMISSION_DENIED");
});
