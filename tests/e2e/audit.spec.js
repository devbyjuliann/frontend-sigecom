import { expect, test } from "@playwright/test";

const password = process.env.SIGECOM_E2E_PASSWORD;

async function signIn(page, email) {
  await page.goto("/ingresar", {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByRole("textbox", { name: "Contraseña" }).fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/inicio$/);
}

test("Administrador filtra, consulta detalles y recorre páginas de Auditoría", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await signIn(page, "frontend-e2e-admin@sigecom.invalid");
  await page
    .getByRole("navigation", { name: "Navegación principal" })
    .getByRole("link", { name: "Auditoría", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Auditoría" }).last(),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Actualizando opciones" }),
  ).toHaveCount(0);

  const listRequests = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/audit-events?")) {
      listRequests.push(new URL(request.url()).searchParams);
    }
  });
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  const firstRow = page.getByRole("row").nth(1);
  await expect(firstRow).toBeVisible();
  await firstRow.getByRole("button", { name: /Ver detalle/ }).click();
  const detail = page.getByRole("dialog", { name: "Detalle del evento" });
  await expect(detail).toBeVisible();
  await expect(
    detail.getByText("Información permitida para tu rol y alcance."),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(detail).toBeHidden();

  await expect(page.getByRole("button", { name: "Siguiente" })).toBeEnabled();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await expect
    .poll(() => listRequests.some((params) => params.has("cursor")))
    .toBe(true);
  await expect(page.getByRole("button", { name: "Anterior" })).toBeEnabled();
  await page.getByRole("button", { name: "Anterior" }).click();
  await expect(page.getByRole("button", { name: "Anterior" })).toBeDisabled();

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(
      page.getByRole("heading", { name: "Auditoría" }).last(),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});

test("Auditor puede consultar Auditoría", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, "frontend-e2e-auditor@sigecom.invalid");
  await page.goto("/auditoria");
  await expect(
    page.getByRole("heading", { name: "Auditoría" }).last(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Aplicar filtros" }),
  ).toBeVisible();
});

test("Vendedor no ve el módulo y recibe rechazo al entrar por URL", async ({
  page,
}) => {
  await signIn(page, "frontend-e2e@sigecom.invalid");
  await expect(
    page
      .getByRole("navigation", { name: "Navegación principal" })
      .getByRole("link", { name: "Auditoría", exact: true }),
  ).toHaveCount(0);
  await page.goto("/auditoria");
  await expect(page).toHaveURL(/\/acceso-denegado$/);
  await expect(
    page.getByRole("heading", { name: "Acceso no autorizado" }),
  ).toBeVisible();
});
