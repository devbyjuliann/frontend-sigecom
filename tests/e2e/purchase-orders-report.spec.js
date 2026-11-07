import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const password = process.env.SIGECOM_E2E_PASSWORD;
const screenshotDirectory = join(tmpdir(), "opencode", "sigecom-6.3c3-visual");

async function signIn(page, email) {
  const csrf = await page.request.get("/api/v1/auth/csrf");
  const { csrfToken } = await csrf.json();
  const response = await page.request.post("/api/v1/auth/login", {
    headers: {
      Origin: "http://127.0.0.1:5174",
      "X-CSRF-Token": csrfToken,
    },
    data: { email, password },
  });
  expect(response.status()).toBe(200);
}

test("administrator switches to current purchase-order pending report and queries a period", async ({
  page,
}) => {
  const calls = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/reports/purchase-orders?"))
      calls.push(request.url());
  });
  await signIn(page, "frontend-e2e-admin@sigecom.invalid");
  await page.goto("/reportes");
  await expect(page.getByLabel("Tipo de reporte")).toHaveValue("sales");
  await page.getByLabel("Tipo de reporte").selectOption("purchases");
  await expect(
    page.getByRole("heading", {
      name: "Recepciones y Devoluciones de Compras",
      level: 2,
    }),
  ).toBeVisible();
  await page.getByLabel("Tipo de reporte").selectOption("purchase-orders");
  await expect(
    page.getByRole("heading", {
      name: "Órdenes de Compra y Pendientes",
      level: 2,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Modalidad")).toHaveValue("pending");
  await expect(page.getByLabel("Desde")).toHaveCount(0);
  await expect
    .poll(() =>
      calls.some((url) => new URL(url).searchParams.get("mode") === "pending"),
    )
    .toBe(true);
  const pendingUrl = new URL(
    calls.find((url) => new URL(url).searchParams.get("mode") === "pending"),
  );
  expect(pendingUrl.searchParams.has("dateFrom")).toBe(false);
  expect(pendingUrl.searchParams.has("dateTo")).toBe(false);
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByText("Cargando Órdenes de Compra y Pendientes…"),
  ).toHaveCount(0);
  for (const [width, height] of [
    [1440, 900],
    [1280, 720],
    [768, 1024],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await mkdir(screenshotDirectory, { recursive: true });
    await page.screenshot({
      path: join(screenshotDirectory, `${width}x${height}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }

  await page.getByLabel("Modalidad").selectOption("period");
  await expect(page.getByLabel("Desde")).toBeVisible();
  await page.getByRole("button", { name: "Consultar" }).click();
  await expect
    .poll(() =>
      calls.some((url) => new URL(url).searchParams.get("mode") === "period"),
    )
    .toBe(true);
  const periodUrl = new URL(
    calls.find((url) => new URL(url).searchParams.get("mode") === "period"),
  );
  expect(periodUrl.searchParams.get("dateFrom")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(periodUrl.searchParams.get("dateTo")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await expect(page.getByText(/situación actual al consultar/)).toBeVisible();
});

test("auditor can select orders while seller is denied the report hub", async ({
  page,
}) => {
  await signIn(page, "frontend-e2e-auditor@sigecom.invalid");
  await page.goto("/reportes");
  await page.getByLabel("Tipo de reporte").selectOption("purchase-orders");
  await expect(page.getByLabel("Modalidad")).toHaveValue("pending");

  await signIn(page, "frontend-e2e@sigecom.invalid");
  await page.goto("/reportes");
  await expect(
    page.getByRole("heading", { name: "Acceso no autorizado" }),
  ).toBeVisible();
  await expect(page.getByLabel("Tipo de reporte")).toHaveCount(0);
});
