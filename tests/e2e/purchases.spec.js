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

  const ordersResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/v1/purchase-orders" &&
      response.request().method() === "GET"
    );
  });
  await page.goto("/compras", { waitUntil: "commit" });
  const ordersResponse = await ordersResponsePromise;
  expect(ordersResponse.ok()).toBe(true);
  const orderList = await ordersResponse.json();
  expect(Array.isArray(orderList.items)).toBe(true);
  await expect(
    page.getByRole("heading", { name: "Órdenes de compra" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Nueva orden" })).toBeVisible();
  await expect(
    page.getByRole("searchbox", { name: "Buscar órdenes" }),
  ).toBeVisible();
  if (orderList.items.length === 0) {
    expect(orderList.pagination.total).toBe(0);
    await expect(page.getByText("Aún no hay órdenes de compra")).toBeVisible();
  } else {
    expect(Number(orderList.pagination.total)).toBeGreaterThan(0);
    const ordersTable = page.getByRole("region", {
      name: "Órdenes de compra",
    });
    await expect(ordersTable).toBeVisible();
    await expect(ordersTable.getByRole("row")).toHaveCount(
      orderList.items.length + 1,
    );
    await expect(page.getByLabel("Paginación de órdenes")).toContainText(
      `${orderList.pagination.total} órdenes`,
    );
  }

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
