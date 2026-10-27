import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  render,
  screen,
  within,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { useAuth } from "../auth/auth-context.jsx";
import { ApiError, dashboardApi } from "../lib/auth-api.js";
import DashboardPage from "./dashboard-page.jsx";

vi.mock("../lib/auth-api.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, dashboardApi: { get: vi.fn() } };
});
vi.mock("../auth/auth-context.jsx", () => ({ useAuth: vi.fn() }));

const completeDashboard = {
  indicators: {
    activeProducts: { available: true, value: 12 },
    customers: { available: true, value: 3 },
    suppliers: { available: true, value: 2 },
    accessibleWarehouses: { available: true, value: 1 },
  },
  productsByCategory: {
    available: true,
    items: [
      { categoryId: "1", categoryName: "Ferretería", activeProducts: 5 },
      { categoryId: "2", categoryName: "Aseo", activeProducts: 7 },
    ],
  },
};

function renderDashboard({
  permissions = [
    "dashboard.read",
    "products.read",
    "categories.read",
    "customers.read",
    "suppliers.read",
    "warehouses.read",
    "profile.read",
  ],
  userId = "user-1",
  dashboard = completeDashboard,
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  }),
} = {}) {
  const reloadSession = vi.fn();
  useAuth.mockReturnValue({
    session: {
      user: {
        id: userId,
        email: `${userId}@example.invalid`,
        displayName: "María Gómez",
        role: "administrator",
      },
      permissions,
      warehouseIds: ["1"],
    },
    reloadSession,
  });
  dashboardApi.get.mockImplementation(() => Promise.resolve(dashboard));
  return {
    queryClient,
    reloadSession,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

describe("DashboardPage", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows real summary, category data, user greeting and authorized shortcuts", async () => {
    renderDashboard();
    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "María Gómez",
    );
    expect(screen.getByText("Aseo: 7 productos.")).toBeInTheDocument();
    expect(screen.getByText("Ferretería: 5 productos.")).toBeInTheDocument();
    expect(
      screen.getByText("12 productos activos · 2 categorías"),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("list", {
          name: "Valores de productos por categoría",
        }),
      )
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Aseo: 7 productos.", "Ferretería: 5 productos."]);
    expect(screen.getByRole("link", { name: "Productos" })).toHaveAttribute(
      "href",
      "/productos",
    );
    expect(screen.getByRole("link", { name: "Clientes" })).toHaveAttribute(
      "href",
      "/clientes",
    );
    expect(screen.queryByText(/ventas netas|utilidad/i)).toBeNull();
  });

  it("hides module indicators and shortcuts the current user cannot read", async () => {
    renderDashboard({
      permissions: ["dashboard.read", "products.read"],
      dashboard: {
        ...completeDashboard,
        indicators: {
          ...completeDashboard.indicators,
          customers: { available: false, value: null },
          suppliers: { available: false, value: null },
          accessibleWarehouses: { available: false, value: null },
        },
        productsByCategory: { available: false, items: null },
      },
    });
    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Clientes" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Proveedores" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Bodegas" })).toBeNull();
    expect(
      screen.queryByText("Distribución de productos por categoría"),
    ).toBeNull();
  });

  it("distinguishes zero values from unavailable metrics and empty categories", async () => {
    renderDashboard({
      dashboard: {
        indicators: {
          activeProducts: { available: true, value: 0 },
          customers: { available: false, value: null },
          suppliers: { available: false, value: null },
          accessibleWarehouses: { available: true, value: 0 },
        },
        productsByCategory: { available: true, items: [] },
      },
    });
    expect(
      await screen.findByText(
        "No hay productos activos para distribuir por categoría.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("Clientes registrados")).toBeNull();
  });

  it("shows a recoverable API error instead of stale summary data", async () => {
    dashboardApi.get.mockRejectedValueOnce(
      new Error("API temporalmente no disponible."),
    );
    renderDashboard();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "API temporalmente no disponible.",
    );
    expect(screen.queryByText("12")).toBeNull();
    dashboardApi.get.mockResolvedValueOnce(completeDashboard);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(screen.getByText("12")).toBeInTheDocument());
  });

  it("revalidates auth and hides cached dashboard data after session expiry", async () => {
    dashboardApi.get.mockRejectedValueOnce(
      new ApiError({
        status: 401,
        code: "SESSION_INVALID",
        message: "Inicia sesión para continuar.",
      }),
    );
    const { reloadSession } = renderDashboard();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tu sesión expiró.",
    );
    await waitFor(() => expect(reloadSession).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("12")).toBeNull();
  });

  it("uses an isolated query key for each signed-in user", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const first = renderDashboard({ userId: "user-1", queryClient });
    expect(await screen.findByText("12")).toBeInTheDocument();
    first.unmount();
    renderDashboard({ userId: "user-2", queryClient });
    await waitFor(() => expect(dashboardApi.get).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("12")).toBeInTheDocument();
  });
});
