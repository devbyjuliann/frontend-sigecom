import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import SalesPage from "./sales-page.jsx";
import { salesApi, warehousesApi } from "../lib/auth-api.js";
import { useAuth } from "../auth/auth-context.jsx";

vi.mock("../lib/auth-api.js", () => ({
  salesApi: { list: vi.fn() },
  warehousesApi: { list: vi.fn() },
}));
vi.mock("../auth/auth-context.jsx", () => ({ useAuth: vi.fn() }));

function renderSales(
  items = [
    {
      id: "12",
      number: "VE-000012",
      saleDate: "2026-10-30",
      customerName: "Distribuidora Andina",
      warehouseName: "Bodega Norte",
      status: "draft",
      total: "3704.00",
    },
  ],
  permissions = ["sales.read", "sales.create"],
  path = "/ventas",
  warehousePages = null,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  useAuth.mockReturnValue({ session: { permissions } });
  salesApi.list.mockResolvedValue({
    items,
    pagination: { page: 1, pageSize: 20, total: items.length, pageCount: 1 },
  });
  warehousesApi.list.mockImplementation(({ page }) => {
    const result = warehousePages?.[page] || {
      items: [],
      pagination: { page, pageSize: 100, total: 0, pageCount: 0 },
    };
    return result instanceof Error
      ? Promise.reject(result)
      : Promise.resolve(result);
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/ventas" element={<SalesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("SalesPage", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows scoped sales, exact COP text, draft state, and create navigation", async () => {
    renderSales();
    expect(await screen.findByText("VE-000012")).toBeInTheDocument();
    expect(screen.getByText("Distribuidora Andina")).toBeInTheDocument();
    expect(screen.getByText("$ 3.704,00")).toBeInTheDocument();
    expect(screen.getByText("Borrador")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /nueva venta/i })).toHaveAttribute(
      "href",
      "/ventas/nueva",
    );
  });

  it("shows an honest empty state and hides create without permission", async () => {
    renderSales([], ["sales.read"]);
    expect(
      await screen.findByText("No hay ventas para mostrar"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /nueva venta/i }),
    ).not.toBeInTheDocument();
  });

  it("shows historical sales from inactive warehouses and marks them", async () => {
    renderSales([
      {
        id: "13",
        number: "VE-000013",
        saleDate: "2026-10-29",
        customerName: "Cliente Histórico",
        warehouseName: "Bodega Cerrada",
        warehouseIsActive: false,
        status: "confirmed",
        total: "100.00",
      },
    ]);

    expect(await screen.findByText("VE-000013")).toBeInTheDocument();
    expect(screen.getByText("Bodega Cerrada")).toBeInTheDocument();
    expect(screen.getByText("(inactiva)")).toBeInTheDocument();
    expect(warehousesApi.list).toHaveBeenCalledWith(
      expect.objectContaining({ status: "all" }),
    );
  });

  it("keeps a customer context filter in the sales API request", async () => {
    renderSales(undefined, ["sales.read"], "/ventas?customerId=44");

    await screen.findByText("VE-000012");
    expect(salesApi.list).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: "44" }),
    );
    expect(screen.getByText("Filtrando por cliente #44")).toBeInTheDocument();
  });

  it("permite filtrar ventas por una bodega autorizada fuera de la primera página", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: String(index + 1),
      name: `Bodega ${index + 1}`,
    }));
    renderSales(undefined, ["sales.read"], "/ventas", {
      1: {
        items: firstPage,
        pagination: { page: 1, pageSize: 100, total: 101, pageCount: 2 },
      },
      2: {
        items: [{ id: "101", name: "Bodega Final" }],
        pagination: { page: 2, pageSize: 100, total: 101, pageCount: 2 },
      },
    });

    const filter = screen.getByRole("combobox", { name: "Filtrar por bodega" });
    expect(
      await within(filter).findByRole("option", { name: "Bodega Final" }),
    ).toHaveValue("101");
  });

  it("permite reintentar si falla una página de bodegas sin ofrecer una lista incompleta", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: String(index + 1),
      name: `Bodega ${index + 1}`,
    }));
    const pages = {
      1: {
        items: firstPage,
        pagination: { page: 1, pageSize: 100, total: 101, pageCount: 2 },
      },
      2: new Error("Sin conexión"),
    };
    renderSales(undefined, ["sales.read"], "/ventas", pages);
    expect(
      await screen.findByText(
        "No se pudieron cargar las bodegas para filtrar.",
      ),
    ).toBeInTheDocument();
    const filter = screen.getByRole("combobox", { name: "Filtrar por bodega" });
    expect(filter).toBeDisabled();
    expect(
      within(filter).queryByRole("option", { name: "Central" }),
    ).toBeNull();

    pages[2] = {
      items: [{ id: "101", name: "Norte" }],
      pagination: { page: 2, pageSize: 100, total: 101, pageCount: 2 },
    };
    fireEvent.click(screen.getByRole("button", { name: "Reintentar bodegas" }));
    expect(
      await within(filter).findByRole("option", { name: "Norte" }),
    ).toHaveValue("101");
  });
});
