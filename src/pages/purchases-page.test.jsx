import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PurchasesPage from "./purchases-page.jsx";
import { purchasesApi, warehousesApi } from "../lib/auth-api.js";
import { useAuth } from "../auth/auth-context.jsx";

vi.mock("../lib/auth-api.js", () => ({
  purchasesApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    confirm: vi.fn(),
    cancel: vi.fn(),
  },
  warehousesApi: { list: vi.fn() },
}));
vi.mock("../auth/auth-context.jsx", () => ({ useAuth: vi.fn() }));

function renderPage(
  path = "/compras",
  items = [
    {
      id: "15",
      number: "OC-000015",
      orderDate: "2026-10-29",
      supplierName: "Distribuidora Andina",
      warehouseName: "Bodega Norte",
      status: "draft",
      total: "12500.00",
      version: 1,
      lines: [
        {
          id: "151",
          sku: "ARR-1",
          name: "Arroz",
          unit: "bulto",
          quantity: 5,
          receivedQuantity: 0,
          pendingQuantity: 5,
        },
        {
          id: "152",
          sku: "ACE-12",
          name: "Aceite",
          unit: "caja",
          quantity: 12,
          receivedQuantity: 0,
          pendingQuantity: 12,
        },
      ],
    },
  ],
  permissions = ["purchases.read", "purchases.create"],
  warehousePages = null,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  useAuth.mockReturnValue({
    session: {
      user: { role: "administrator" },
      permissions,
    },
  });
  purchasesApi.list.mockResolvedValue({
    items,
    pagination: { page: 1, pageSize: 20, total: items.length, pageCount: 1 },
  });
  warehousesApi.list.mockImplementation(({ page }) => {
    const result = warehousePages?.[page] || {
      items: [],
      pagination: { page: 1, pageSize: 100, total: 0, pageCount: 0 },
    };
    return result instanceof Error
      ? Promise.reject(result)
      : Promise.resolve(result);
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/compras" element={<PurchasesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PurchasesPage", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("incluye bodegas asignadas de la segunda página en el filtro de compras", async () => {
    const first = Array.from({ length: 100 }, (_, index) => ({
      id: String(index + 1),
      name: `Bodega ${index + 1}`,
      isActive: true,
    }));
    renderPage("/compras", undefined, ["purchases.read", "warehouses.read"], {
      1: {
        items: first,
        pagination: { page: 1, pageSize: 100, total: 101, pageCount: 2 },
      },
      2: {
        items: [{ id: "101", name: "Bodega Final", isActive: true }],
        pagination: { page: 2, pageSize: 100, total: 101, pageCount: 2 },
      },
    });
    expect(
      await screen.findByRole("option", { name: "Bodega Final" }),
    ).toHaveValue("101");
  });

  it("bloquea el filtro incompleto y permite reintentar la carga de compras", async () => {
    const first = Array.from({ length: 100 }, (_, index) => ({
      id: String(index + 1),
      name: `Bodega ${index + 1}`,
      isActive: true,
    }));
    renderPage("/compras", undefined, ["purchases.read", "warehouses.read"], {
      1: {
        items: first,
        pagination: { page: 1, pageSize: 100, total: 101, pageCount: 2 },
      },
      2: new Error("sin red"),
    });
    const filter = screen.getByRole("combobox", { name: "Bodega" });
    expect(
      await screen.findByRole("button", { name: "Reintentar bodegas" }),
    ).toBeInTheDocument();
    expect(filter).toBeDisabled();
    expect(
      within(filter).queryByRole("option", { name: "Bodega 1" }),
    ).toBeNull();
    warehousesApi.list.mockImplementation(({ page }) =>
      Promise.resolve(
        page === 1
          ? {
              items: first,
              pagination: { page: 1, pageSize: 100, total: 101, pageCount: 2 },
            }
          : {
              items: [{ id: "101", name: "Bodega Final", isActive: true }],
              pagination: { page: 2, pageSize: 100, total: 101, pageCount: 2 },
            },
      ),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Reintentar bodegas" }),
    );
    await waitFor(() => expect(filter).toBeEnabled());
    expect(
      within(filter).getByRole("option", { name: "Bodega Final" }),
    ).toHaveValue("101");
  });

  it("shows real purchase orders, COP amounts, and a contextual create action", async () => {
    renderPage();
    expect(await screen.findByText("OC-000015")).toBeInTheDocument();
    expect(screen.getByText("Distribuidora Andina")).toBeInTheDocument();
    expect(screen.getByText(/12\.500/)).toBeInTheDocument();
    const createOrderLink = screen.getByRole("link", {
      name: /nueva orden/i,
    });
    expect(createOrderLink).toHaveAttribute("href", "/compras/nueva");
    expect(createOrderLink).toHaveClass("purchase-create-button");
    expect(createOrderLink.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("marks orders assigned to inactive warehouses as historical", async () => {
    renderPage("/compras", [
      {
        id: "18",
        number: "OC-000018",
        orderDate: "2026-10-27",
        supplierName: "Proveedor Histórico",
        warehouseName: "Bodega Cerrada",
        warehouseIsActive: false,
        status: "confirmed",
        total: "900.00",
        version: 1,
        lines: [],
      },
    ]);

    expect(await screen.findByText("OC-000018")).toBeInTheDocument();
    expect(screen.getByText("(inactiva)")).toBeInTheDocument();
  });

  it("expands each order accessibly to show its own ordered, received, and pending quantities", async () => {
    const user = userEvent.setup();
    renderPage("/compras", [
      {
        id: "15",
        number: "OC-000015",
        orderDate: "2026-10-29",
        supplierName: "Distribuidora Andina",
        warehouseName: "Bodega Norte",
        status: "draft",
        total: "12500.00",
        version: 1,
        lines: [
          {
            id: "151",
            sku: "ARR-1",
            name: "Arroz",
            unit: "bulto",
            quantity: 5,
            receivedQuantity: 0,
            pendingQuantity: 5,
          },
          {
            id: "152",
            sku: "ACE-12",
            name: "Aceite",
            unit: "caja",
            quantity: 12,
            receivedQuantity: 0,
            pendingQuantity: 12,
          },
        ],
      },
      {
        id: "16",
        number: "OC-000016",
        orderDate: "2026-10-28",
        supplierName: "Proveedor Centro",
        warehouseName: "Bodega Centro",
        status: "confirmed",
        total: "800.00",
        version: 2,
        lines: [
          {
            id: "161",
            sku: "AZU-1",
            name: "Azúcar",
            unit: "kg",
            quantity: 8,
            receivedQuantity: 3,
            pendingQuantity: 5,
          },
        ],
      },
      {
        id: "17",
        number: "OC-000017",
        orderDate: "2026-10-27",
        supplierName: "Proveedor Sur",
        warehouseName: "Bodega Sur",
        status: "confirmed",
        total: "900.00",
        version: 3,
        lines: [
          {
            id: "171",
            sku: "SAL-1",
            name: "Sal",
            unit: "saco",
            quantity: 9,
            receivedQuantity: 9,
            pendingQuantity: 0,
          },
        ],
      },
    ]);

    const noReceiptToggle = await screen.findByRole("button", {
      name: "Mostrar productos de la orden OC-000015",
    });
    noReceiptToggle.focus();
    await user.keyboard("{Enter}");
    expect(
      await screen.findByRole("button", {
        name: "Ocultar productos de la orden OC-000015",
      }),
    ).toHaveAttribute("aria-expanded", "true");
    const noReceiptTable = screen.getByRole("table", {
      name: "Productos de la orden OC-000015",
    });
    expect(
      within(noReceiptTable).getByRole("columnheader", {
        name: "Cantidad recibida",
      }),
    ).toBeInTheDocument();
    expect(
      within(noReceiptTable).getByRole("row", {
        name: /ARR-1 Arroz bulto 5 0 5/,
      }),
    ).toBeInTheDocument();
    expect(
      within(noReceiptTable).getByRole("row", {
        name: /ACE-12 Aceite caja 12 0 12/,
      }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Mostrar productos de la orden OC-000016",
      }),
    );
    const partialTable = screen.getByRole("table", {
      name: "Productos de la orden OC-000016",
    });
    expect(
      within(partialTable).getByRole("row", {
        name: /AZU-1 Azúcar kg 8 3 5/,
      }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Mostrar productos de la orden OC-000017",
      }),
    );
    const completeTable = screen.getByRole("table", {
      name: "Productos de la orden OC-000017",
    });
    expect(
      within(completeTable).getByRole("row", {
        name: /SAL-1 Sal saco 9 9 0/,
      }),
    ).toBeInTheDocument();
    expect(purchasesApi.list).toHaveBeenCalledTimes(1);
  });

  it("keeps a supplier context filter in the purchase API request", async () => {
    renderPage("/compras?supplierId=42", []);

    expect(
      await screen.findByText("Aún no hay órdenes de compra"),
    ).toBeInTheDocument();
    expect(purchasesApi.list).toHaveBeenCalledWith(
      expect.objectContaining({ supplierId: "42" }),
    );
    expect(screen.getByText("Filtrando por proveedor #42")).toBeInTheDocument();
  });
});
