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
  commercial: {
    period: {
      dateFrom: "2026-11-01",
      dateTo: "2026-11-30",
      timeZone: "America/Bogota",
    },
    salesNet: { available: true, value: "110.00" },
    purchasesReceived: { available: true, value: "80.25" },
    inventoryValue: { available: true, value: "825.50" },
    stockedProducts: { available: true, value: 6 },
    lowStockProducts: { available: true, value: 2 },
    pendingReceipts: { available: true, value: 3 },
    salesTrend: {
      available: true,
      items: [
        { month: "2026-09", value: "0.00" },
        { month: "2026-10", value: "35.50" },
        { month: "2026-11", value: "110.00" },
      ],
    },
    topProducts: {
      available: true,
      items: [
        {
          productId: "2",
          sku: "SKU-2",
          name: "Martillo",
          unit: "unidad",
          quantity: "3",
          amount: "110.00",
        },
      ],
    },
    inventoryByWarehouse: {
      available: true,
      items: [
        {
          warehouseId: "1",
          warehouseCode: "B01",
          warehouseName: "Principal",
          stockedProducts: 6,
          stockedPairs: 8,
        },
      ],
    },
    recentActivity: {
      available: true,
      items: [
        {
          type: "sale_confirmation",
          occurredAt: "2026-11-14T15:00:00.000Z",
          documentCode: "VE-2026-1",
          warehouseCode: "B01",
          warehouseName: "Principal",
          amount: "110.00",
        },
      ],
    },
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
    "sales.read",
    "purchases.read",
    "inventory.read",
    "products.read",
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

  it("does not reserve a quick-access row while dashboard data loads", () => {
    dashboardApi.get.mockReturnValue(new Promise(() => {}));
    const { container } = renderDashboard();

    expect(container.querySelector(".dashboard-shortcuts")).toBeNull();
  });

  it("shows the real summary without redundant shortcuts", async () => {
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
    expect(
      screen.queryByRole("navigation", {
        name: "Accesos directos autorizados",
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Ventas netas del mes")).toBeInTheDocument();
    expect(screen.getByText("Compras recibidas del mes")).toBeInTheDocument();
    expect(
      screen.getByText("Ventas netas del mes").closest("article"),
    ).toHaveTextContent(/110,00/);
    expect(screen.getByText("Productos con stock bajo")).toBeInTheDocument();
    expect(screen.getByText("Productos con existencias")).toBeInTheDocument();
    expect(
      screen.getByText("Valor estimado del inventario"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Valor estimado del inventario").closest("article"),
    ).toHaveTextContent(/825,50/);
    expect(
      screen.getByRole("heading", { name: "Tendencia de ventas" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Productos más vendidos" }),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("list", {
          name: "Existencias autorizadas por bodega",
        }),
      ).getByRole("listitem"),
    ).toHaveTextContent("B01 · Principal: 6 productos distintos.");
    expect(
      screen.getByText("Actividad comercial reciente"),
    ).toBeInTheDocument();
    expect(screen.getByText(/VE-2026-1/)).toBeInTheDocument();
  });

  it("hides module indicators the current user cannot read", async () => {
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
        commercial: {
          period: completeDashboard.commercial.period,
          salesNet: { available: false, value: null },
          purchasesReceived: { available: false, value: null },
          inventoryValue: { available: false, value: null },
          stockedProducts: { available: false, value: null },
          lowStockProducts: { available: false, value: null },
          pendingReceipts: { available: false, value: null },
        },
      },
    });
    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(screen.queryByText("Ventas netas del mes")).toBeNull();
    expect(
      screen.queryByText("Distribución de productos por categoría"),
    ).toBeNull();
  });

  it("does not render cached commercial charts without the corresponding module and warehouse permissions", async () => {
    renderDashboard({ permissions: ["dashboard.read", "warehouses.read"] });
    await screen.findByRole("heading", { level: 2 });
    expect(
      screen.queryByRole("heading", { name: "Tendencia de ventas" }),
    ).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Productos más vendidos" }),
    ).toBeNull();
    expect(screen.queryByText("Actividad comercial reciente")).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Inventario por bodega" }),
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
