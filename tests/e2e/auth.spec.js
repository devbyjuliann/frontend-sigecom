import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { provisionTestAccounts } from "./support/database-fixture.mjs";

const sellerEmail = "frontend-e2e@sigecom.invalid";
const forcedEmail = "frontend-e2e-forced@sigecom.invalid";
const profileEmail = "frontend-e2e-profile@sigecom.invalid";
const password = process.env.SIGECOM_E2E_PASSWORD;
const screenshotDirectory = join(tmpdir(), "opencode", "sigecom-1.4-visual");

test.beforeEach(async ({ page }) => {
  await page.goto("/ingresar");
  await expect(
    page.getByRole("heading", { name: "Iniciar sesión" }),
  ).toBeVisible();
});

async function signIn(
  page,
  email = sellerEmail,
  passwordValue = process.env.SIGECOM_E2E_PASSWORD,
) {
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByRole("textbox", { name: "Contraseña" }).fill(passwordValue);
  await page.getByRole("button", { name: "Ingresar" }).click();
}

test("rechaza credenciales incorrectas con un mensaje claro", async ({
  page,
}) => {
  await page.getByLabel("Correo electrónico").fill(sellerEmail);
  await page
    .getByRole("textbox", { name: "Contraseña" })
    .fill("credencial-incorrecta-e2e");
  await page.getByRole("button", { name: "Ingresar" }).click();

  await expect(page.getByRole("alert")).toHaveText(
    "Correo o contraseña incorrectos.",
  );
  await expect(
    page.getByRole("heading", { name: "Iniciar sesión" }),
  ).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
});

test("valida campos y permite mostrar u ocultar la contraseña", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByText("Escribe un correo válido.")).toBeVisible();
  await expect(page.getByText("Escribe tu contraseña.")).toBeVisible();

  await page.getByRole("textbox", { name: "Contraseña" }).fill(password);
  await page.getByRole("button", { name: "Mostrar contraseña" }).click();
  await expect(
    page.getByRole("textbox", { name: "Contraseña" }),
  ).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Ocultar contraseña" }).click();
  await expect(
    page.getByRole("textbox", { name: "Contraseña" }),
  ).toHaveAttribute("type", "password");
});

test("persiste la sesión al recargar y revoca la sesión al cerrar", async ({
  page,
}) => {
  await signIn(page);
  await expect(page).toHaveURL(/\/inicio$/);
  await expect(
    page.getByRole("heading", { name: "Bienvenido, Vendedor de pruebas" }),
  ).toBeVisible();

  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Saltar al contenido" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#contenido-principal")).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "Bienvenido, Vendedor de pruebas" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Menú de usuario: Vendedor de pruebas" }),
  ).toContainText("Vendedor");
  await expect(
    page.getByRole("link", { name: "Inicio", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);

  const sessionCookie = (await page.context().cookies()).find(
    (cookie) => cookie.name === "sigecom_session",
  );
  expect(sessionCookie).toBeTruthy();
  expect(sessionCookie.httpOnly).toBe(true);
  const sessionCookieValue = sessionCookie.value;

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Bienvenido, Vendedor de pruebas" }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Menú de usuario: Vendedor de pruebas" })
    .press("Enter");
  await expect(
    page.getByRole("menuitem", { name: "Cerrar sesión" }),
  ).toBeVisible();
  await mkdir(screenshotDirectory, { recursive: true });
  await page.screenshot({
    path: join(screenshotDirectory, "menu-usuario-1440x900.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("menuitem", { name: "Cerrar sesión" }),
  ).toBeHidden();

  await page
    .getByRole("button", { name: "Menú de usuario: Vendedor de pruebas" })
    .press("Enter");
  await page.getByRole("menuitem", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/ingresar$/);
  await expect(
    page.getByRole("heading", { name: "Iniciar sesión" }),
  ).toBeVisible();
  expect(
    (await page.context().cookies()).some(
      (cookie) => cookie.name === "sigecom_session",
    ),
  ).toBe(false);

  const revokedSession = await page.request.get("/api/v1/auth/me", {
    headers: { Cookie: `sigecom_session=${sessionCookieValue}` },
  });
  expect(revokedSession.status()).toBe(401);
});

test("protege la navegación, limita la búsqueda y permite operar el sidebar con teclado", async ({
  page,
}) => {
  await page.goto("/inicio");
  await expect(page).toHaveURL(/\/ingresar$/);
  await signIn(page);
  await expect(page).toHaveURL(/\/inicio$/);

  const search = page.getByRole("searchbox", {
    name: "Buscar páginas disponibles",
  });
  await search.fill("inventario");
  await expect(page.getByRole("status")).toHaveText(
    "No hay páginas disponibles con ese nombre.",
  );
  await search.fill("inicio");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/inicio$/);

  const collapse = page.getByRole("button", { name: "Contraer menú lateral" });
  await collapse.click();
  await expect(
    page.getByRole("button", { name: "Expandir menú lateral" }),
  ).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "Expandir menú lateral" }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Abrir menú" }).press("Enter");
  const dialog = page.getByRole("dialog", { name: "Menú de navegación" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("link", { name: "Inicio", exact: true }),
  ).toBeVisible();
  await mkdir(screenshotDirectory, { recursive: true });
  await page.screenshot({
    path: join(screenshotDirectory, "menu-movil-390x844.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("deniega la ruta protegida si el usuario no tiene el permiso", async ({
  page,
}) => {
  await page.route("**/api/v1/auth/me", async (route) => {
    const response = await route.fetch();
    if (response.status() !== 200) return route.fulfill({ response });
    const session = await response.json();
    return route.fulfill({ response, json: { ...session, permissions: [] } });
  });

  await signIn(page);
  await expect(page).toHaveURL(/\/acceso-denegado$/);
  await expect(
    page.getByRole("heading", { name: "Acceso no autorizado" }),
  ).toBeVisible();
});

test("devuelve a login cuando el backend informa que la sesión expiró", async ({
  page,
}) => {
  await signIn(page);
  await expect(page).toHaveURL(/\/inicio$/);

  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "SESSION_INVALID", message: "La sesión venció." },
      }),
    }),
  );
  await page.reload();
  await expect(page).toHaveURL(/\/ingresar$/);
  await expect(
    page.getByRole("heading", { name: "Iniciar sesión" }),
  ).toBeVisible();
});

test("mantiene bloqueadas las operaciones mientras el cambio de contraseña sea obligatorio", async ({
  page,
}) => {
  await signIn(page, forcedEmail);
  await expect(page).toHaveURL(/\/cambio-obligatorio$/);
  await expect(
    page.getByRole("heading", { name: "Debes cambiar tu contraseña" }),
  ).toBeVisible();
  await page.goto("/inicio");
  await expect(page).toHaveURL(/\/cambio-obligatorio$/);
  await expect(page.getByRole("link", { name: "Inicio" })).toHaveCount(0);

  const profileAttempt = await page.request.get("/api/v1/profile");
  expect(profileAttempt.status()).toBe(403);
  expect((await profileAttempt.json()).error.code).toBe(
    "PASSWORD_CHANGE_REQUIRED",
  );

  const newPassword = "Cambio-Seguro-2026!Aa";
  await page.getByLabel("Contraseña actual").fill(password);
  await page.getByLabel("Nueva contraseña", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirmar nueva contraseña").fill(newPassword);
  await page
    .getByRole("button", { name: "Cambiar contraseña y continuar" })
    .click();
  await expect(page).toHaveURL(/\/ingresar$/);
  await expect(page.getByRole("status")).toContainText(
    "Ingresa con tu nueva contraseña",
  );

  await page.getByLabel("Correo electrónico").fill(forcedEmail);
  await page.getByRole("textbox", { name: "Contraseña" }).fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Correo o contraseña incorrectos.",
  );

  await signIn(page, forcedEmail, newPassword);
  await expect(page).toHaveURL(/\/inicio$/);
  await expect(
    page.getByRole("heading", {
      name: "Bienvenido, Cuenta con cambio obligatorio",
    }),
  ).toBeVisible();
});

test("edita el perfil propio y cambia la contraseña desde el perfil", async ({
  page,
}) => {
  const newPassword = "Perfil-Seguro-2026!Aa";
  await signIn(page, profileEmail);
  await expect(page).toHaveURL(/\/inicio$/);
  await page
    .getByRole("button", {
      name: "Menú de usuario: Cuenta de perfil de pruebas",
    })
    .click();
  await page.getByRole("menuitem", { name: "Mi perfil" }).click();
  await expect(
    page.getByRole("heading", { name: "Datos personales" }),
  ).toBeVisible();

  const displayName = page.getByLabel("Nombre para mostrar");
  await displayName.fill("Perfil editado en pruebas");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Tus datos personales se guardaron.",
  );
  await page.reload();
  await expect(displayName).toHaveValue("Perfil editado en pruebas");

  await page.getByLabel("Contraseña actual").fill(password);
  await page.getByLabel("Nueva contraseña", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirmar nueva contraseña").fill(newPassword);
  await page.getByRole("button", { name: "Actualizar contraseña" }).click();
  await expect(page).toHaveURL(/\/ingresar$/);
  await expect(page.getByRole("status")).toContainText(
    "Ingresa con tu nueva contraseña",
  );

  await page.getByLabel("Correo electrónico").fill(profileEmail);
  await page.getByRole("textbox", { name: "Contraseña" }).fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Correo o contraseña incorrectos.",
  );

  await signIn(page, profileEmail, newPassword);
  await expect(page).toHaveURL(/\/inicio$/);
  await page.goto("/perfil");
  await expect(page.getByLabel("Nombre para mostrar")).toHaveValue(
    "Perfil editado en pruebas",
  );
});

test("login y layout no desbordan y se capturan en las resoluciones requeridas", async ({
  page,
}) => {
  await mkdir(screenshotDirectory, { recursive: true });
  const viewports = [
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/ingresar");
    await expect(
      page.getByRole("heading", { name: "Iniciar sesión" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: join(
        screenshotDirectory,
        `login-${viewport.width}x${viewport.height}.png`,
      ),
      fullPage: true,
    });
  }

  await signIn(page);
  await expect(page).toHaveURL(/\/inicio$/);
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await expect(
      page.getByRole("heading", { name: "Bienvenido, Vendedor de pruebas" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: join(
        screenshotDirectory,
        `inicio-${viewport.width}x${viewport.height}.png`,
      ),
      fullPage: true,
    });
  }

  await page.goto("/perfil");
  await expect(
    page.getByRole("heading", { name: "Datos personales" }),
  ).toBeVisible();
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: join(
        screenshotDirectory,
        `perfil-${viewport.width}x${viewport.height}.png`,
      ),
      fullPage: true,
    });
  }

  await page.getByRole("button", { name: /Menú de usuario:/ }).click();
  await page.getByRole("menuitem", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/ingresar$/);
  await provisionTestAccounts();
  await page.goto("/ingresar");
  await signIn(page, forcedEmail);
  await expect(page).toHaveURL(/\/cambio-obligatorio$/);
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: join(
        screenshotDirectory,
        `cambio-obligatorio-${viewport.width}x${viewport.height}.png`,
      ),
      fullPage: true,
    });
  }
});

test("muestra un mensaje accionable si no se puede conectar con la API", async ({
  page,
}) => {
  await page.route("**/api/v1/auth/csrf", (route) => route.abort("failed"));
  await page.getByLabel("Correo electrónico").fill(sellerEmail);
  await page.getByRole("textbox", { name: "Contraseña" }).fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "No se pudo conectar con SIGECOM",
  );
});
