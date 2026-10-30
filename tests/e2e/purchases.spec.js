import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "@playwright/test";

const screenshotDirectory = join(tmpdir(), "opencode", "sigecom-4.1a-visual");
const password = process.env.SIGECOM_E2E_PASSWORD;

test("administrador consulta Compras en escritorio y móvil", async ({
  page,
}) => {
  const csrfResponse = await page.request.get("/api/v1/auth/csrf");
  const csrf = await csrfResponse.json();
  const login = await page.request.post("/api/v1/auth/login", {
    headers: {
      Origin: "http://127.0.0.1:5174",
      "X-CSRF-Token": csrf.csrfToken,
    },
    data: { email: "frontend-e2e-admin@sigecom.invalid", password },
  });
  expect(login.status()).toBe(200);

  await page.goto("/compras", { waitUntil: "commit" });
  await expect(
    page.getByRole("heading", { name: "Órdenes de compra" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Nueva orden" })).toBeVisible();
  await expect(
    page.getByRole("searchbox", { name: "Buscar órdenes" }),
  ).toBeVisible();
  await expect(page.getByText("Aún no hay órdenes de compra")).toBeVisible();

  await mkdir(screenshotDirectory, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({
    path: join(screenshotDirectory, "orders-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: join(screenshotDirectory, "orders-mobile.png"),
    fullPage: true,
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});
