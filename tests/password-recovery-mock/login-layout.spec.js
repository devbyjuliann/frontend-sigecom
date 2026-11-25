import { expect, test } from "@playwright/test";

const centeredViewports = [
  { name: "escritorio", width: 1440, height: 900 },
  { name: "portatil", width: 1280, height: 720 },
  { name: "tableta", width: 768, height: 1024 },
  { name: "movil", width: 390, height: 844 },
];

async function openLogin(page, { width, height }) {
  await page.setViewportSize({ width, height });
  await page.route("**/api/v1/**", async (route) => {
    const { pathname } = new URL(route.request().url());
    const isSessionRequest = pathname === "/api/v1/auth/me";

    await route.fulfill({
      status: isSessionRequest ? 401 : 404,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: isSessionRequest ? "SESSION_INVALID" : "NOT_FOUND",
          message: isSessionRequest ? "Inicia sesión." : "Ruta no encontrada.",
        },
      }),
    });
  });
  await page.goto("/ingresar", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "Iniciar sesión" }),
  ).toBeVisible();
}

async function getLoginLayoutMetrics(page) {
  return page.evaluate(() => {
    const panel = document.querySelector(".login-form-panel");
    const form = document.querySelector(".login-form-wrap");
    const brand = document.querySelector(".login-mobile-brand");
    const copyright = document.querySelector(".login-copyright");
    const panelBounds = panel.getBoundingClientRect();
    const formBounds = form.getBoundingClientRect();
    const brandBounds = brand.getBoundingClientRect();
    const brandStyle = getComputedStyle(brand);
    const panelStyle = getComputedStyle(panel);
    const mobileBrandIsVisible = brandStyle.display !== "none";
    const blockTop = mobileBrandIsVisible ? brandBounds.top : formBounds.top;
    const blockBottom = formBounds.bottom;
    const availableTop =
      panelBounds.top + Number.parseFloat(panelStyle.paddingTop);
    const availableBottom = copyright.getBoundingClientRect().top;

    return {
      blockCenter: (blockTop + blockBottom) / 2,
      availableCenter: (availableTop + availableBottom) / 2,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      viewportWidth: window.innerWidth,
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
    };
  });
}

for (const viewport of centeredViewports) {
  test(`centra el bloque completo de acceso en ${viewport.name}`, async ({
    page,
  }) => {
    await openLogin(page, viewport);

    const metrics = await getLoginLayoutMetrics(page);

    expect(
      Math.abs(metrics.blockCenter - metrics.availableCenter),
    ).toBeLessThanOrEqual(8);
    expect(
      Math.max(metrics.scrollWidth, metrics.bodyScrollWidth),
    ).toBeLessThanOrEqual(metrics.viewportWidth);
    await page.screenshot({
      path: `test-results/password-recovery-mock/login-${viewport.name}.png`,
      fullPage: true,
      animations: "disabled",
    });
  });
}

for (const viewport of centeredViewports) {
  test(`centra horizontalmente los textos del Login en ${viewport.name}`, async ({
    page,
  }) => {
    await openLogin(page, viewport);

    const textAlignment = await page.evaluate(() => ({
      securityNote: getComputedStyle(
        document.querySelector(".login-security-note"),
      ).textAlign,
      copyright: getComputedStyle(document.querySelector(".login-copyright"))
        .textAlign,
    }));

    expect(textAlignment).toEqual({
      securityNote: "center",
      copyright: "center",
    });
  });
}

test("mantiene SIGECOM como título incluso tras un cambio dinámico", async ({
  page,
}) => {
  await openLogin(page, { width: 1280, height: 720 });

  await expect(page).toHaveTitle("SIGECOM");
  await page.evaluate(() => {
    document.title = "Dashboard";
  });
  await expect(page).toHaveTitle("SIGECOM");
});

test("con poca altura conserva el desplazamiento y el acceso por teclado", async ({
  page,
}) => {
  await openLogin(page, { width: 390, height: 600 });

  const metrics = await getLoginLayoutMetrics(page);
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.viewportHeight);
  expect(
    Math.max(metrics.scrollWidth, metrics.bodyScrollWidth),
  ).toBeLessThanOrEqual(metrics.viewportWidth);
  await page.screenshot({
    path: "test-results/password-recovery-mock/login-altura-reducida.png",
    fullPage: true,
    animations: "disabled",
  });

  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Correo electrónico")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("textbox", { name: "Contraseña" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Mostrar contraseña" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Ingresar" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "¿Olvidaste tu contraseña?" }),
  ).toBeFocused();
  await page.keyboard.press("PageDown");
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);
  await expect(
    page.getByText(/Si necesitas ayuda, contacta a tu administrador/),
  ).toBeInViewport();
});
