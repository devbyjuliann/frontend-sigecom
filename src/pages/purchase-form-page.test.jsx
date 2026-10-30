import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PurchaseFormPage from "./purchase-form-page.jsx";
import {
  productsApi,
  purchasesApi,
  suppliersApi,
  warehousesApi,
} from "../lib/auth-api.js";
import { useAuth } from "../auth/auth-context.jsx";

vi.mock("../lib/auth-api.js", () => ({
  productsApi: { list: vi.fn() },
  purchasesApi: { get: vi.fn(), create: vi.fn(), update: vi.fn() },
  suppliersApi: { list: vi.fn() },
  warehousesApi: { list: vi.fn() },
  ApiError: class ApiError extends Error {},
}));
vi.mock("../auth/auth-context.jsx", () => ({ useAuth: vi.fn() }));

function renderForm() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  useAuth.mockReturnValue({
    session: {
      user: { role: "administrator" },
      permissions: ["purchases.create"],
    },
  });
  suppliersApi.list.mockResolvedValue({
    items: [
      {
        id: "2",
        businessName: "Distribuidora Andina",
        identificationNumber: "900123",
      },
    ],
    pagination: { page: 1, pageCount: 1 },
  });
  warehousesApi.list.mockResolvedValue({
    items: [{ id: "3", name: "Bodega Norte" }],
  });
  productsApi.list.mockResolvedValue({
    items: [
      {
        id: "8",
        sku: "CAJ-008",
        name: "Caja de café",
        unit: "caja",
        purchasePrice: "1250.50",
      },
    ],
    pagination: { page: 1, pageCount: 1 },
  });
  purchasesApi.create.mockResolvedValue({ id: "15", status: "draft" });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/compras/nueva"]}>
        <Routes>
          <Route path="/compras/nueva" element={<PurchaseFormPage />} />
          <Route path="/compras/:id" element={<h1>Detalle de prueba</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PurchaseFormPage", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("builds and saves a supplier and warehouse order without changing stock", async () => {
    renderForm();
    await screen.findByRole("option", { name: /Distribuidora Andina/ });
    await screen.findByRole("option", { name: "Bodega Norte" });
    fireEvent.change(
      await screen.findByRole("combobox", { name: "Proveedor" }),
      { target: { value: "2" } },
    );
    fireEvent.change(screen.getByLabelText("Bodega destino"), {
      target: { value: "3" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: /caja de café/i }),
    );
    fireEvent.change(screen.getByLabelText("Cantidad de Caja de café"), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));

    await waitFor(() =>
      expect(purchasesApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          supplierId: "2",
          warehouseId: "3",
          lines: [{ productId: "8", quantity: 3, unitCost: "1250.50" }],
        }),
      ),
    );
    expect(
      await screen.findByRole("heading", { name: "Detalle de prueba" }),
    ).toBeInTheDocument();
  });
});
