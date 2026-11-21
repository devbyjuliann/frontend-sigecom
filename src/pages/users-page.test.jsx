import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import UsersPage from "./users-page.jsx";
import { usersApi, warehousesApi } from "../lib/auth-api.js";
import { useAuth } from "../auth/auth-context.jsx";

vi.mock("../lib/auth-api.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    usersApi: {
      list: vi.fn(),
      roles: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      setStatus: vi.fn(),
      resetPassword: vi.fn(),
      resendInvitation: vi.fn(),
    },
    warehousesApi: { list: vi.fn() },
  };
});

vi.mock("../auth/auth-context.jsx", () => ({ useAuth: vi.fn() }));

const user = {
  id: "42",
  email: "ana@sigecom.co",
  displayName: "Ana Gómez",
  roleCode: "seller",
  roleName: "Vendedor",
  isActive: true,
  passwordChangeRequired: false,
  credentialState: "active",
  warehouseCount: 1,
  visibleWarehouseCount: 1,
  canManage: true,
  revision: "revision-01234567890123456789",
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  useAuth.mockReturnValue({
    session: {
      user: { id: "5", role: "administrator" },
      permissions: [
        "users.read",
        "users.manage",
        "roles.manage",
        "warehouses.read",
      ],
    },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/usuarios"]}>
        <Routes>
          <Route path="/usuarios" element={<UsersPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

describe("UsersPage", () => {
  beforeEach(() => {
    usersApi.list.mockResolvedValue({
      items: [user],
      pagination: { page: 1, pageSize: 10, total: 1, pageCount: 1 },
    });
    usersApi.roles.mockResolvedValue({
      items: [
        { code: "administrator", name: "Administrador" },
        { code: "seller", name: "Vendedor" },
        { code: "warehouse", name: "Bodega" },
        { code: "auditor", name: "Auditor" },
      ],
    });
    warehousesApi.list.mockResolvedValue({
      items: [
        { id: "3", code: "CENTRAL", name: "Bodega Central", isActive: true },
      ],
      pagination: { page: 1, pageSize: 10, total: 1, pageCount: 1 },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("creates an invited account without exposing or caching a password", async () => {
    const { queryClient } = renderPage();
    expect(
      await screen.findByRole("row", { name: /Ana Gómez/ }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Nuevo usuario" }));
    expect(
      screen.getByText(
        "Al crearla, enviaremos una invitación al correo registrado. La persona deberá definir su contraseña antes de ingresar.",
      ),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nombre completo"), {
      target: { value: "Lucía Pérez" },
    });
    fireEvent.change(screen.getByLabelText("Correo electrónico"), {
      target: { value: "lucia@sigecom.co" },
    });
    fireEvent.click(
      await screen.findByRole("checkbox", { name: /Bodega Central/ }),
    );
    usersApi.create.mockResolvedValueOnce({
      user: {
        ...user,
        id: "43",
        email: "lucia@sigecom.co",
        displayName: "Lucía Pérez",
        credentialState: "pending_invitation",
      },
      invitation: { deliveryStatus: "accepted" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear usuario" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      /invitación enviada/i,
    );
    expect(screen.queryByText(/contraseña temporal/i)).not.toBeInTheDocument();
    expect(usersApi.create).toHaveBeenCalledWith({
      email: "lucia@sigecom.co",
      displayName: "Lucía Pérez",
      roleCode: "seller",
      warehouseIds: ["3"],
    });
    const cached = JSON.stringify(
      queryClient
        .getQueryCache()
        .getAll()
        .map((query) => query.state.data),
    );
    expect(cached).not.toContain("temporaryPassword");
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
  });

  it("does not claim that a simulated invitation was emailed", async () => {
    renderPage();
    await screen.findByRole("row", { name: /Ana Gómez/ });
    fireEvent.click(screen.getByRole("button", { name: "Nuevo usuario" }));
    fireEvent.change(screen.getByLabelText("Nombre completo"), {
      target: { value: "Lucía Pérez" },
    });
    fireEvent.change(screen.getByLabelText("Correo electrónico"), {
      target: { value: "lucia@sigecom.co" },
    });
    fireEvent.click(
      await screen.findByRole("checkbox", { name: /Bodega Central/ }),
    );
    usersApi.create.mockResolvedValueOnce({
      user: {
        ...user,
        id: "43",
        email: "lucia@sigecom.co",
        displayName: "Lucía Pérez",
        credentialState: "pending_invitation",
      },
      invitation: { deliveryStatus: "simulated" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear usuario" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      /simulado.*no se envió/i,
    );
  });

  it("allows an administrator to resend an expired pending invitation", async () => {
    usersApi.list.mockResolvedValueOnce({
      items: [
        {
          ...user,
          credentialState: "pending_invitation",
          isActive: true,
        },
      ],
      pagination: { page: 1, pageSize: 10, total: 1, pageCount: 1 },
    });
    usersApi.get.mockResolvedValueOnce({
      ...user,
      credentialState: "pending_invitation",
      revision: "invitation-revision-current",
    });
    usersApi.resendInvitation.mockResolvedValueOnce({
      user: { ...user, credentialState: "pending_invitation" },
      invitation: { deliveryStatus: "accepted" },
    });
    renderPage();

    await screen.findByRole("row", { name: /Ana Gómez/ });
    expect(screen.getByText("Invitación pendiente")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Reenviar invitación a Ana Gómez",
      }),
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      /invitación enviada/i,
    );
    expect(usersApi.resendInvitation).toHaveBeenCalledWith("42", {
      expectedRevision: "invitation-revision-current",
      confirmResend: true,
    });
  });

  it("keeps account status read-only when its warehouse scope exceeds the administrator's", async () => {
    usersApi.list.mockResolvedValueOnce({
      items: [
        {
          ...user,
          canManage: false,
          warehouseCount: 3,
          visibleWarehouseCount: 1,
        },
      ],
      pagination: { page: 1, pageSize: 10, total: 1, pageCount: 1 },
    });
    renderPage();
    expect(await screen.findByText("Fuera de alcance")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Editar Ana Gómez/ }),
    ).not.toBeInTheDocument();
  });

  it("requires confirmation before changing account access", async () => {
    usersApi.get.mockResolvedValueOnce({
      ...user,
      assignedWarehouses: [
        { id: "3", code: "CENTRAL", name: "Bodega Central", isActive: true },
      ],
      hasOutOfScopeWarehouses: false,
    });
    usersApi.update.mockResolvedValueOnce({
      ...user,
      email: "ana.nueva@sigecom.co",
    });
    renderPage();
    await screen.findByRole("row", { name: /Ana Gómez/ });
    fireEvent.click(screen.getByRole("button", { name: "Editar Ana Gómez" }));
    fireEvent.change(await screen.findByLabelText("Correo electrónico"), {
      target: { value: "ana.nueva@sigecom.co" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(
      await screen.findByRole("dialog", { name: "Confirmar cambio de acceso" }),
    ).toBeInTheDocument();
    expect(usersApi.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar cambios" }));
    await waitFor(() =>
      expect(usersApi.update).toHaveBeenCalledWith("42", {
        expectedRevision: user.revision,
        email: "ana.nueva@sigecom.co",
      }),
    );
  });

  it("confirms an emailed password reset without revealing a temporary password", async () => {
    const { queryClient } = renderPage();
    usersApi.get.mockResolvedValueOnce({
      ...user,
      revision: "revision-current",
    });
    await screen.findByRole("row", { name: /Ana Gómez/ });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Restablecer contraseña de Ana Gómez",
      }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Restablecer contraseña" }),
    ).toHaveTextContent("Ana Gómez");
    expect(usersApi.resetPassword).not.toHaveBeenCalled();
    usersApi.resetPassword.mockResolvedValueOnce({
      user: { ...user, credentialState: "pending_admin_reset" },
      deliveryStatus: "accepted",
      revokedSessions: 2,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar restablecimiento" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      /enviado.*correo/i,
    );
    expect(usersApi.resetPassword).toHaveBeenCalledWith("42", {
      expectedRevision: "revision-current",
      confirmReset: true,
    });
    expect(
      JSON.stringify(
        queryClient
          .getQueryCache()
          .getAll()
          .map((query) => query.state.data),
      ),
    ).not.toContain("temporaryPassword");
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
    expect(usersApi.resetPassword).toHaveBeenCalledTimes(1);
  });

  it("does not repeat an uncertain reset and allows a status-only refresh", async () => {
    renderPage();
    usersApi.get
      .mockResolvedValueOnce({ ...user, revision: "revision-current" })
      .mockResolvedValueOnce({
        ...user,
        revision: "revision-after-uncertain-request",
        passwordChangeRequired: true,
      });
    usersApi.resetPassword.mockRejectedValueOnce({
      code: "NETWORK_ERROR",
      status: 0,
      message: "No se pudo conectar.",
    });
    await screen.findByRole("row", { name: /Ana Gómez/ });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Restablecer contraseña de Ana Gómez",
      }),
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Confirmar restablecimiento",
      }),
    );
    expect(
      await screen.findByText(/No se pudo confirmar el resultado/),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Consultar estado actual" }),
    );
    expect(await screen.findByText(/Estado actualizado/)).toBeInTheDocument();
    expect(usersApi.resetPassword).toHaveBeenCalledTimes(1);
    expect(usersApi.get).toHaveBeenCalledTimes(2);
  });
});
