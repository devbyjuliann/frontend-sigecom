import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const administratorEmail = "frontend-e2e-admin@sigecom.invalid";
const sellerEmail = "frontend-e2e-category-seller@sigecom.invalid";
const password = process.env.SIGECOM_E2E_PASSWORD;
const screenshotDirectory = join(tmpdir(), "opencode", "sigecom-2.1-visual");

async function signIn(page, email = administratorEmail) {
  await page.goto("/ingresar");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByRole("textbox", { name: "Contraseña" }).fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/inicio$/);
}

test("administrator manages categories, searches and filters, and the data persists", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await signIn(page);
  await page.getByRole("link", { name: "Categorías", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Categorías", level: 2 }),
  ).toBeVisible();

  const suffix = Date.now().toString();
  const categoryName = `Prueba E2E ${suffix}`;
  await page.getByRole("button", { name: "Nueva categoría" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill(categoryName);
  await page
    .getByLabel("Descripción (opcional)")
    .fill("Categoría creada desde Playwright");
  await page.getByRole("button", { name: "Crear categoría" }).click();
  await page
    .getByRole("searchbox", { name: "Buscar por nombre o descripción" })
    .fill(suffix);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(
    page.getByRole("row", { name: new RegExp(categoryName) }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("row", { name: new RegExp(categoryName) }),
  ).toBeVisible();

  await page.getByRole("button", { name: `Editar ${categoryName}` }).click();
  await page
    .getByLabel("Nombre", { exact: true })
    .fill(`${categoryName} editada`);
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(
    page.getByRole("row", { name: new RegExp(`${categoryName} editada`) }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: `Desactivar ${categoryName} editada` })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Desactivar categoría" }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Desactivar" })
    .click();
  await expect(
    page.getByRole("row", { name: new RegExp(`${categoryName} editada`) }),
  ).toHaveCount(0);

  await page.locator("#category-status-filter").selectOption("inactive");
  await expect(
    page.getByRole("row", { name: new RegExp(`${categoryName} editada`) }),
  ).toBeVisible();
  await page
    .getByRole("searchbox", { name: "Buscar por nombre o descripción" })
    .fill(suffix);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(
    page.getByRole("row", { name: new RegExp(`${categoryName} editada`) }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `Activar ${categoryName} editada` })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Activar" })
    .click();
  await page.locator("#category-status-filter").selectOption("all");
  await page
    .getByRole("searchbox", { name: "Buscar por nombre o descripción" })
    .fill("");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await page
    .getByRole("searchbox", { name: "Buscar por nombre o descripción" })
    .fill(suffix);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(
    page.getByRole("row", { name: new RegExp(`${categoryName} editada`) }),
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
        `categorias-${viewport.width}x${viewport.height}.png`,
      ),
      fullPage: true,
    });
  }
});

test("seller can read categories but cannot create or edit them", async ({
  page,
}) => {
  await signIn(page, sellerEmail);
  await page.goto("/categorias");
  await expect(
    page.getByRole("heading", { name: "Categorías", level: 2 }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Nueva categoría" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Editar / })).toHaveCount(0);

  const response = await page.request.post("/api/v1/categories", {
    data: { name: `Seller no autorizado ${Date.now()}` },
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
