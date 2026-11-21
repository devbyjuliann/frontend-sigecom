import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BrowserRouter,
  Link,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import { useAuth } from "../auth/auth-context.jsx";
import { authApi } from "../lib/auth-api.js";
import LoginPage from "./login-page.jsx";
import {
  AcceptInvitationPage,
  RequestPasswordRecoveryPage,
  ResetPasswordPage,
} from "./password-recovery-pages.jsx";

vi.mock("../auth/auth-context.jsx", () => ({ useAuth: vi.fn() }));
vi.mock("../lib/auth-api.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    authApi: {
      ...actual.authApi,
      login: vi.fn(),
      requestPasswordRecovery: vi.fn(),
      completePasswordRecovery: vi.fn(),
      completeInvitation: vi.fn(),
      completeAdminPasswordReset: vi.fn(),
    },
  };
});

function renderRoute(path, element, controls = null) {
  window.history.replaceState(null, "", path);
  return render(
    <BrowserRouter>
      {controls}
      <Routes>
        <Route path="/ingresar" element={<LoginPage />} />
        <Route
          path="/recuperar-contrasena"
          element={<RequestPasswordRecoveryPage />}
        />
        <Route path="/restablecer-contrasena" element={<ResetPasswordPage />} />
        <Route path="/aceptar-invitacion" element={<AcceptInvitationPage />} />
        <Route path="*" element={element} />
      </Routes>
    </BrowserRouter>,
  );
}

function RecoveryNavigationControls({ linkToken, navigateToken }) {
  const navigate = useNavigate();
  return (
    <nav aria-label="Navegación de prueba de recuperación">
      <Link to={`/restablecer-contrasena#token=${linkToken}`}>
        Abrir segundo enlace con Link
      </Link>
      <button
        type="button"
        onClick={() =>
          navigate(`/restablecer-contrasena#token=${navigateToken}`)
        }
      >
        Abrir enlace con navigate
      </button>
      <button type="button" onClick={() => navigate("/ingresar")}>
        Ir a Login en prueba
      </button>
      <button type="button" onClick={() => navigate(-1)}>
        Atrás en prueba
      </button>
      <button type="button" onClick={() => navigate(1)}>
        Adelante en prueba
      </button>
    </nav>
  );
}

describe("password recovery pages", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("keeps the existing login and adds a recovery link", () => {
    useAuth.mockReturnValue({ login: vi.fn(), isLoggingIn: false });

    renderRoute("/ingresar");

    expect(
      screen.getByRole("heading", { name: "Iniciar sesión" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Correo electrónico")).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "¿Olvidaste tu contraseña?" }),
    ).toHaveAttribute("href", "/recuperar-contrasena");
  });

  it("accepts an invitation and activates the account with the chosen password", async () => {
    const token = "I".repeat(43);
    const clearSessionAfterPasswordRecovery = vi.fn();
    useAuth.mockReturnValue({ clearSessionAfterPasswordRecovery });
    authApi.completeInvitation.mockResolvedValueOnce({ changed: true });

    renderRoute(`/aceptar-invitacion#token=${token}`);
    expect(
      await screen.findByRole("heading", { name: "Activa tu cuenta" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nueva contraseña"), {
      target: { value: "Nueva-Clave-Segura-2026" },
    });
    fireEvent.change(screen.getByLabelText("Confirmar nueva contraseña"), {
      target: { value: "Nueva-Clave-Segura-2026" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }));

    expect(
      await screen.findByRole("heading", { name: "Cuenta activada" }),
    ).toBeInTheDocument();
    expect(authApi.completeInvitation).toHaveBeenCalledWith({
      token,
      newPassword: "Nueva-Clave-Segura-2026",
      confirmPassword: "Nueva-Clave-Segura-2026",
    });
    expect(authApi.completePasswordRecovery).not.toHaveBeenCalled();
    expect(clearSessionAfterPasswordRecovery).toHaveBeenCalled();
  });

  it("uses the administrative reset endpoint for administrator-issued links", async () => {
    const token = "R".repeat(43);
    useAuth.mockReturnValue({
      clearSessionAfterPasswordRecovery: vi.fn(),
    });
    authApi.completeAdminPasswordReset.mockResolvedValueOnce({ changed: true });

    renderRoute(`/restablecer-contrasena?modo=administrativo#token=${token}`);
    expect(
      await screen.findByRole("heading", {
        name: "Establecer contraseña",
      }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nueva contraseña"), {
      target: { value: "Nueva-Clave-Segura-2026" },
    });
    fireEvent.change(screen.getByLabelText("Confirmar nueva contraseña"), {
      target: { value: "Nueva-Clave-Segura-2026" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }));

    expect(
      await screen.findByRole("heading", { name: "Acceso restablecido" }),
    ).toBeInTheDocument();
    expect(authApi.completeAdminPasswordReset).toHaveBeenCalledWith({
      token,
      newPassword: "Nueva-Clave-Segura-2026",
      confirmPassword: "Nueva-Clave-Segura-2026",
    });
    expect(authApi.completePasswordRecovery).not.toHaveBeenCalled();
  });

  it("submits a recovery request and shows the same neutral confirmation", async () => {
    authApi.requestPasswordRecovery.mockResolvedValue({ accepted: true });

    renderRoute("/recuperar-contrasena");
    fireEvent.change(screen.getByLabelText("Correo electrónico"), {
      target: { value: "ana@sigecom.co" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Enviar instrucciones" }),
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      /Si la cuenta está activa/i,
    );
    expect(authApi.requestPasswordRecovery).toHaveBeenCalledWith(
      "ana@sigecom.co",
    );
    expect(
      screen.getByRole("link", { name: "Volver a iniciar sesión" }),
    ).toHaveAttribute("href", "/ingresar");
  });

  it("shows retryable network errors without exposing account status", async () => {
    authApi.requestPasswordRecovery.mockRejectedValue(
      Object.assign(new Error("offline"), { code: "NETWORK_ERROR" }),
    );

    renderRoute("/recuperar-contrasena");
    fireEvent.change(screen.getByLabelText("Correo electrónico"), {
      target: { value: "ana@sigecom.co" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Enviar instrucciones" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /No fue posible enviar/i,
    );
    expect(screen.queryByText(/no existe|inactiva/i)).not.toBeInTheDocument();
  });

  it("announces the pending state and prevents duplicate recovery submissions", async () => {
    let resolveRequest;
    authApi.requestPasswordRecovery.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );

    renderRoute("/recuperar-contrasena");
    fireEvent.change(screen.getByLabelText("Correo electrónico"), {
      target: { value: "ana@sigecom.co" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Enviar instrucciones" }),
    );

    const pendingButton = screen.getByRole("button", {
      name: "Enviando solicitud…",
    });
    expect(pendingButton).toBeDisabled();
    resolveRequest({ accepted: true });
    expect(await screen.findByRole("status")).toHaveTextContent(
      /Si la cuenta está activa/i,
    );
  });

  it("blocks passwords that do not meet the shared minimum policy", async () => {
    const token = "P".repeat(43);
    window.history.replaceState(
      null,
      "",
      `/restablecer-contrasena#token=${token}`,
    );
    useAuth.mockReturnValue({ clearSessionAfterPasswordRecovery: vi.fn() });

    renderRoute(`/restablecer-contrasena#token=${token}`);
    await screen.findByLabelText("Nueva contraseña");
    fireEvent.change(screen.getByLabelText("Nueva contraseña"), {
      target: { value: "lowercase-password-2026" },
    });
    fireEvent.change(screen.getByLabelText("Confirmar nueva contraseña"), {
      target: { value: "lowercase-password-2026" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }));

    expect(
      await screen.findByText(/Incluye una letra mayúscula/i),
    ).toBeInTheDocument();
    expect(authApi.completePasswordRecovery).not.toHaveBeenCalled();
  });

  it("removes the fragment token from the URL and keeps it only in memory", async () => {
    const token = "R".repeat(43);
    window.history.replaceState(
      null,
      "",
      `/restablecer-contrasena#token=${token}`,
    );
    const clearSession = vi.fn();
    useAuth.mockReturnValue({
      clearSessionAfterPasswordRecovery: clearSession,
    });
    expect(window.location.hash).toBe(`#token=${token}`);
    authApi.completePasswordRecovery.mockResolvedValue({ changed: true });

    renderRoute(`/restablecer-contrasena#token=${token}`);

    expect(
      await screen.findByLabelText("Nueva contraseña"),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(window.location.hash).toBe("");
    });
    fireEvent.change(screen.getByLabelText("Nueva contraseña"), {
      target: { value: "Nueva-Clave-Segura-2026" },
    });
    fireEvent.change(screen.getByLabelText("Confirmar nueva contraseña"), {
      target: { value: "Nueva-Clave-Segura-2026" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      /contraseña cambió/i,
    );
    expect(authApi.completePasswordRecovery).toHaveBeenCalledWith({
      token,
      newPassword: "Nueva-Clave-Segura-2026",
      confirmPassword: "Nueva-Clave-Segura-2026",
    });
    expect(clearSession).toHaveBeenCalledOnce();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it("uses the newest token after React Router Link navigation to the same route", async () => {
    const firstToken = "A".repeat(43);
    const secondToken = "B".repeat(43);
    window.history.replaceState(
      null,
      "",
      `/restablecer-contrasena#token=${firstToken}`,
    );
    useAuth.mockReturnValue({
      clearSessionAfterPasswordRecovery: vi.fn(),
    });
    authApi.completePasswordRecovery.mockResolvedValue({ changed: true });

    renderRoute(
      `/restablecer-contrasena#token=${firstToken}`,
      null,
      <RecoveryNavigationControls
        linkToken={secondToken}
        navigateToken={"C".repeat(43)}
      />,
    );
    await screen.findByLabelText("Nueva contraseña");
    fireEvent.click(
      screen.getByRole("link", { name: "Abrir segundo enlace con Link" }),
    );
    await waitFor(() => expect(window.location.hash).toBe(""));
    fireEvent.change(screen.getByLabelText("Nueva contraseña"), {
      target: { value: "Nueva-Clave-Segura-2026" },
    });
    fireEvent.change(screen.getByLabelText("Confirmar nueva contraseña"), {
      target: { value: "Nueva-Clave-Segura-2026" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      /contraseña cambió/i,
    );
    expect(authApi.completePasswordRecovery).toHaveBeenCalledWith({
      token: secondToken,
      newPassword: "Nueva-Clave-Segura-2026",
      confirmPassword: "Nueva-Clave-Segura-2026",
    });
  });

  it("uses the token from navigate() and does not resurrect a replaced token after back navigation", async () => {
    const firstToken = "D".repeat(43);
    const nextToken = "E".repeat(43);
    window.history.replaceState(
      null,
      "",
      `/restablecer-contrasena#token=${firstToken}`,
    );
    useAuth.mockReturnValue({
      clearSessionAfterPasswordRecovery: vi.fn(),
    });
    authApi.completePasswordRecovery.mockResolvedValue({ changed: true });

    renderRoute(
      `/restablecer-contrasena#token=${firstToken}`,
      <p>Login de prueba</p>,
      <RecoveryNavigationControls
        linkToken={"F".repeat(43)}
        navigateToken={nextToken}
      />,
    );
    await screen.findByLabelText("Nueva contraseña");
    fireEvent.click(
      screen.getByRole("button", { name: "Abrir enlace con navigate" }),
    );
    await waitFor(() => expect(window.location.hash).toBe(""));
    fireEvent.change(screen.getByLabelText("Nueva contraseña"), {
      target: { value: "Nueva-Clave-Segura-2026" },
    });
    fireEvent.change(screen.getByLabelText("Confirmar nueva contraseña"), {
      target: { value: "Nueva-Clave-Segura-2026" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      /contraseña cambió/i,
    );
    expect(authApi.completePasswordRecovery).toHaveBeenCalledWith({
      token: nextToken,
      newPassword: "Nueva-Clave-Segura-2026",
      confirmPassword: "Nueva-Clave-Segura-2026",
    });
  });

  it("does not resurrect either token when going back and forward between replaced SPA links", async () => {
    const firstToken = "G".repeat(43);
    const secondToken = "H".repeat(43);
    window.history.replaceState(
      null,
      "",
      `/restablecer-contrasena#token=${firstToken}`,
    );
    useAuth.mockReturnValue({
      clearSessionAfterPasswordRecovery: vi.fn(),
    });

    renderRoute(
      `/restablecer-contrasena#token=${firstToken}`,
      <p>Login de prueba</p>,
      <RecoveryNavigationControls
        linkToken={secondToken}
        navigateToken={"J".repeat(43)}
      />,
    );
    await screen.findByLabelText("Nueva contraseña");
    fireEvent.click(
      screen.getByRole("link", { name: "Abrir segundo enlace con Link" }),
    );
    await waitFor(() => expect(window.location.hash).toBe(""));

    fireEvent.click(screen.getByRole("button", { name: "Atrás en prueba" }));
    expect(
      await screen.findByRole("heading", { name: "Solicita un enlace nuevo" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Nueva contraseña")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Adelante en prueba" }));
    expect(
      await screen.findByRole("heading", { name: "Solicita un enlace nuevo" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Nueva contraseña")).not.toBeInTheDocument();
    expect(authApi.completePasswordRecovery).not.toHaveBeenCalled();
  });

  it("does not confirm or clear the session if completing recovery returns an HTTP error", async () => {
    const token = "E".repeat(43);
    window.history.replaceState(
      null,
      "",
      `/restablecer-contrasena#token=${token}`,
    );
    const clearSession = vi.fn();
    useAuth.mockReturnValue({
      clearSessionAfterPasswordRecovery: clearSession,
    });
    authApi.completePasswordRecovery.mockRejectedValue(
      Object.assign(new Error("No fue posible actualizar la contraseña."), {
        code: "API_ERROR",
      }),
    );

    renderRoute(`/restablecer-contrasena#token=${token}`);
    fireEvent.change(screen.getByLabelText("Nueva contraseña"), {
      target: { value: "Nueva-Clave-Segura-2026" },
    });
    fireEvent.change(screen.getByLabelText("Confirmar nueva contraseña"), {
      target: { value: "Nueva-Clave-Segura-2026" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No fue posible actualizar la contraseña.",
    );
    expect(clearSession).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("heading", { name: "Contraseña actualizada" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Nueva contraseña")).toBeInTheDocument();
    expect(window.location.hash).toBe("");
  });

  it("shows an expired-link state for missing, invalid or consumed tokens", async () => {
    const token = "I".repeat(43);
    window.history.replaceState(
      null,
      "",
      `/restablecer-contrasena#token=${token}`,
    );
    const clearSession = vi.fn();
    useAuth.mockReturnValue({
      clearSessionAfterPasswordRecovery: clearSession,
    });
    authApi.completePasswordRecovery.mockRejectedValue(
      Object.assign(new Error("El enlace venció."), {
        code: "PASSWORD_RECOVERY_LINK_INVALID",
      }),
    );

    renderRoute(`/restablecer-contrasena#token=${token}`);
    await screen.findByLabelText("Nueva contraseña");
    fireEvent.change(screen.getByLabelText("Nueva contraseña"), {
      target: { value: "Nueva-Clave-Segura-2026" },
    });
    fireEvent.change(screen.getByLabelText("Confirmar nueva contraseña"), {
      target: { value: "Nueva-Clave-Segura-2026" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /enlace venció/i,
    );
    expect(
      screen.getByRole("link", { name: "Volver a iniciar sesión" }),
    ).toHaveAttribute("href", "/ingresar");
    expect(clearSession).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("heading", { name: "Contraseña actualizada" }),
    ).not.toBeInTheDocument();
    expect(window.location.hash).toBe("");
  });

  it("does not render a usable reset form if the URL has no recovery token", async () => {
    window.history.replaceState(null, "", "/restablecer-contrasena");

    renderRoute("/restablecer-contrasena");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /enlace venció/i,
    );
    expect(screen.queryByLabelText("Nueva contraseña")).not.toBeInTheDocument();
  });
});
