import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
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
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  useAuth.mockReturnValue({ session: { permissions } });
  salesApi.list.mockResolvedValue({
    items,
    pagination: { page: 1, pageSize: 20, total: items.length, pageCount: 1 },
  });
  warehousesApi.list.mockResolvedValue({ items: [] });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/ventas"]}>
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
});
