import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import InventoryPage from "./inventory-page.jsx";
import { inventoryApi, warehousesApi } from "../lib/auth-api.js";
import { useAuth } from "../auth/auth-context.jsx";

vi.mock("../lib/auth-api.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    inventoryApi: {
      balances: vi.fn(),
      totals: vi.fn(),
      movements: vi.fn(),
      movement: vi.fn(),
      operations: vi.fn(),
      operation: vi.fn(),
      reconciliation: vi.fn(),
    },
    warehousesApi: { list: vi.fn() },
  };
});

vi.mock("../auth/auth-context.jsx", () => ({ useAuth: vi.fn() }));

function renderPage(
  permissions = ["inventory.read", "inventory.movements.read"],
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  useAuth.mockReturnValue({
    session: { user: { role: "administrator" }, permissions },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/inventario"]}>
        <Routes>
          <Route path="/inventario" element={<InventoryPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("InventoryPage", () => {
  beforeEach(() => {
    const pagination = { page: 1, pageSize: 10, total: 1, pageCount: 1 };
    inventoryApi.balances.mockResolvedValue({
      items: [
        {
          productId: "47",
          sku: "CAF-001",
          productName: "Café molido",
          warehouseId: "4",
          warehouseName: "Bodega Centro",
          quantity: 0,
          minimumStock: 2,
          unit: "unidad",
          hasBalance: true,
          isLowStock: true,
        },
        {
          productId: "48",
          sku: "AZU-001",
          productName: "Azúcar",
          warehouseId: "4",
          warehouseName: "Bodega Centro",
          quantity: null,
          minimumStock: 0,
          unit: "unidad",
          hasBalance: false,
          isLowStock: false,
        },
      ],
      pagination,
    });
    inventoryApi.totals.mockResolvedValue({ items: [], pagination });
    inventoryApi.movements.mockResolvedValue({ items: [], pagination });
    warehousesApi.list.mockResolvedValue({ items: [] });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows registered zero balances separately from unregistered balances", async () => {
    renderPage();
    expect(
      await screen.findByRole("row", { name: /CAF-001.*Café molido/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("0 unidad")).toBeInTheDocument();
    expect(screen.getByText("Sin saldo registrado")).toBeInTheDocument();
    expect(screen.getAllByText("Stock bajo")).toHaveLength(2);
  });

  it("loads authorized totals and movement views when selected", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: /totales autorizados/i }));
    await screen.findByText("No hay registros para estos filtros.");
    expect(inventoryApi.totals).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("tab", { name: /movimientos/i }));
    await screen.findByText("No hay registros para estos filtros.");
    expect(inventoryApi.movements).toHaveBeenCalled();
  });

  it("shows a clear permission state when the user has no inventory access", () => {
    renderPage([]);
    expect(screen.getByRole("status")).toHaveTextContent("No tienes permisos");
    expect(inventoryApi.balances).not.toHaveBeenCalled();
  });

  it("supports a movement-only reader without requesting balance data", async () => {
    renderPage(["inventory.movements.read"]);
    expect(
      await screen.findByRole("tab", { name: /Movimientos/ }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.queryByRole("tab", { name: "Por bodega" }),
    ).not.toBeInTheDocument();
    expect(inventoryApi.movements).toHaveBeenCalled();
    expect(inventoryApi.balances).not.toHaveBeenCalled();
    expect(warehousesApi.list).not.toHaveBeenCalled();
  });

  it("keeps authorized balances available without warehouse administration permission", async () => {
    renderPage(["inventory.read"]);
    expect(
      await screen.findByRole("row", { name: /CAF-001.*Café molido/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/tus bodegas autorizadas/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Bodega")).not.toBeInTheDocument();
    expect(warehousesApi.list).not.toHaveBeenCalled();
  });

  it("labels inactive warehouses in the authorized selector", async () => {
    warehousesApi.list.mockResolvedValue({
      items: [{ id: "9", name: "Bodega cerrada", isActive: false }],
    });
    renderPage(["inventory.read", "warehouses.read"]);
    expect(
      await screen.findByRole("option", { name: "Bodega cerrada (inactiva)" }),
    ).toBeInTheDocument();
  });

  it("shows actionable errors when inventory or warehouse filters fail to load", async () => {
    inventoryApi.balances.mockRejectedValue(new Error("network error"));
    warehousesApi.list.mockRejectedValue(new Error("network error"));
    renderPage(["inventory.read", "warehouses.read"]);
    expect(
      await screen.findByText(
        "No fue posible cargar la información. Intenta nuevamente.",
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        "No fue posible cargar las bodegas autorizadas para el filtro.",
      ),
    ).toBeInTheDocument();
  });

  it("uses accessible tab keyboard navigation and localized movement labels", async () => {
    inventoryApi.movements.mockResolvedValue({
      items: [
        {
          id: "1",
          createdAt: "2026-10-28 15:30:00",
          sku: "CAF-001",
          productName: "Café molido",
          warehouseName: "Bodega Centro",
          operationType: "initial_stock",
          direction: "IN",
          quantity: 2,
          unit: "unidad",
          responsibleName: "Usuario de prueba",
        },
      ],
      pagination: { page: 1, pageSize: 10, total: 1, pageCount: 1 },
    });
    renderPage();
    const tab = screen.getByRole("tab", { name: /por bodega/i });
    tab.focus();
    fireEvent.keyDown(tab, { key: "End" });
    const movementTab = screen.getByRole("tab", { name: /movimientos/i });
    expect(movementTab).toHaveFocus();
    expect(movementTab).toHaveAttribute("aria-selected", "true");
    expect(movementTab).toHaveAttribute("aria-controls", "inventory-tabpanel");
    expect(
      await screen.findByText("Apertura de inventario"),
    ).toBeInTheDocument();
    expect(screen.getByRole("tabpanel")).toHaveAttribute(
      "aria-labelledby",
      "inventory-tab-movements",
    );
    expect(screen.getByText(/28\/10\/26, 10:30 a\. m\./)).toBeInTheDocument();
  });
});
