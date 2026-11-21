import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import App from "../App.jsx";
import { authApi } from "../lib/auth-api.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

it("retains the successful reset confirmation when an authenticated session is cleared", async () => {
  const token = "R".repeat(43);
  const password = "Nueva-Clave-Segura-2026";
  window.history.replaceState(
    null,
    "",
    `/restablecer-contrasena#token=${token}`,
  );
  const me = vi.spyOn(authApi, "me").mockResolvedValue({
    user: {
      id: "account-A",
      role: "administrator",
      passwordChangeRequired: false,
    },
    permissions: ["dashboard.read"],
    warehouseIds: ["warehouse-A"],
  });
  const events = [];
  const complete = vi
    .spyOn(authApi, "completePasswordRecovery")
    .mockImplementation(async () => {
      events.push("http:200");
      return { changed: true };
    });

  render(<App />);
  await waitFor(
    () => {
      if (!screen.queryByRole("heading", { name: "Establecer contraseña" })) {
        throw new Error("El formulario de restablecimiento no se montó.");
      }
    },
    { timeout: 10_000, onTimeout: (error) => error },
  );
  await waitFor(() => expect(me).toHaveBeenCalled());
  await waitFor(() => expect(window.location.hash).toBe(""));
  let showedInvalidLink = false;
  let showedSessionLoader = false;
  const observer = new MutationObserver(() => {
    showedInvalidLink ||= Boolean(
      screen.queryByRole("heading", { name: "Solicita un enlace nuevo" }),
    );
    showedSessionLoader ||= Boolean(
      screen.queryByRole("heading", { name: "Verificando sesión" }),
    );
  });
  observer.observe(document.body, { subtree: true, childList: true });
  fireEvent.change(screen.getByLabelText("Nueva contraseña"), {
    target: { value: password },
  });
  fireEvent.change(screen.getByLabelText("Confirmar nueva contraseña"), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }));

  await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
  await waitFor(
    () => {
      if (!events.includes("http:200"))
        throw new Error("Falta la respuesta 200.");
      if (!screen.queryByRole("heading", { name: "Contraseña actualizada" })) {
        throw new Error("La confirmación se perdió después del HTTP 200.");
      }
    },
    { timeout: 1500, onTimeout: (error) => error },
  );
  expect(
    screen.queryByRole("heading", { name: "Solicita un enlace nuevo" }),
  ).not.toBeInTheDocument();
  observer.disconnect();
  expect(showedInvalidLink).toBe(false);
  expect(showedSessionLoader).toBe(false);
  expect(
    screen.getByRole("link", { name: "Volver a iniciar sesión" }),
  ).toHaveAttribute("href", "/ingresar");
  expect(window.location.hash).toBe("");
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
}, 20_000);
