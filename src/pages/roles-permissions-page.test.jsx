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
import RolesPermissionsPage from "./roles-permissions-page.jsx";
import { rolesApi } from "../lib/auth-api.js";
import { useAuth } from "../auth/auth-context.jsx";

vi.mock("../lib/auth-api.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    rolesApi: {
      list: vi.fn(),
      getPermissions: vi.fn(),
      updatePermissions: vi.fn(),
    },
  };
});
vi.mock("../auth/auth-context.jsx", () => ({ useAuth: vi.fn() }));

const detail = {
  role: {
    code: "administrator",
    name: "Administrador",
    description: "Acceso administrativo.",
  },
  revision: "revision-token-012345678901234567890",
  policyVersion: 1,
  configurablePermissionCodes: ["customers.read", "sales.read"],
  affectedAccountCount: 2,
  canEdit: true,
  permissions: [
    {
      code: "customers.read",
      name: "Consultar clientes",
      module: "customers",
      description: "Consulta clientes.",
      assigned: true,
      category: "configurable",
      compatible: true,
      dependencies: [],
    },
    {
      code: "sales.read",
      name: "Consultar ventas",
      module: "sales",
      description: "Consulta ventas.",
      assigned: true,
      category: "configurable",
      compatible: true,
      dependencies: [],
    },
    {
      code: "dashboard.read",
      name: "Consultar resumen",
      module: "dashboard",
      description: "Entrada común.",
      assigned: true,
      category: "protected",
      compatible: true,
      dependencies: [],
      reason: "Esencial",
    },
  ],
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  useAuth.mockReturnValue({ logout: vi.fn().mockResolvedValue(undefined) });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/administracion/roles"]}>
        <Routes>
          <Route
            path="/administracion/roles"
            element={<RolesPermissionsPage />}
          />
          <Route path="/ingresar" element={<p>Iniciar sesión</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

describe("RolesPermissionsPage", () => {
  beforeEach(() => {
    rolesApi.list.mockResolvedValue({
      items: [
        { code: "administrator", name: "Administrador" },
        { code: "seller", name: "Vendedor" },
        { code: "warehouse", name: "Bodega" },
        { code: "auditor", name: "Auditor" },
      ],
    });
    rolesApi.getPermissions.mockResolvedValue(detail);
    rolesApi.updatePermissions.mockResolvedValue({
      changed: true,
      reauthenticationRequired: false,
    });
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("reviews and confirms a configurable permission change", async () => {
    renderPage();
    expect(
      await screen.findByText(
        "Los cambios afectan a todas las cuentas que tienen este rol.",
      ),
    ).toBeInTheDocument();
    const customerRead = await screen.findByRole("checkbox", {
      name: /Consultar clientes/,
    });
    fireEvent.click(customerRead);
    fireEvent.click(screen.getByRole("button", { name: /Revisar cambios/ }));
    expect(
      screen.getByText("Consultar clientes", { selector: "li" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar y guardar" }),
    );
    await waitFor(() =>
      expect(rolesApi.updatePermissions).toHaveBeenCalledWith(
        "administrator",
        expect.objectContaining({
          expectedRevision: detail.revision,
          configurablePermissionCodes: ["sales.read"],
          confirmChange: true,
        }),
      ),
    );
  });

  it("renders protected permissions as non-editable", async () => {
    renderPage();
    expect(await screen.findAllByText("Protegido")).toHaveLength(2);
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
  });
});
