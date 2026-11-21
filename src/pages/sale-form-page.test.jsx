import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import SaleFormPage from "./sale-form-page.jsx";
import {
  customersApi,
  productsApi,
  salesApi,
  warehousesApi,
} from "../lib/auth-api.js";
import { useAuth } from "../auth/auth-context.jsx";
import {
  activatePendingOperationStorage,
  clearPendingOperationStorage,
} from "../auth/pending-operation-storage.js";

vi.mock("../lib/auth-api.js", () => ({
  ApiError: class ApiError extends Error {},
  customersApi: { list: vi.fn() },
  productsApi: { list: vi.fn(), balances: vi.fn() },
  salesApi: { get: vi.fn(), create: vi.fn(), update: vi.fn() },
  warehousesApi: { list: vi.fn() },
}));
vi.mock("../auth/auth-context.jsx", () => ({ useAuth: vi.fn() }));

function renderForm(warehousePages = null) {
  const session = {
    user: { id: "seller-A", role: "seller", passwordChangeRequired: false },
    permissions: ["sales.create", "sales.read"],
    warehouseIds: ["8"],
  };
  useAuth.mockReturnValue({
    session,
    pendingStorageLease: activatePendingOperationStorage(session).lease,
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  customersApi.list.mockResolvedValue({
    items: [
      { id: "4", name: "Cliente Mayorista", identificationNumber: "900123" },
    ],
    pagination: { page: 1, pageCount: 1 },
  });
  warehousesApi.list.mockImplementation(({ page }) => {
    const result = warehousePages?.[page] || {
      items: [{ id: "8", name: "Bodega Norte" }],
      pagination: { page: 1, pageSize: 100, total: 1, pageCount: 1 },
    };
    return result instanceof Error
      ? Promise.reject(result)
      : Promise.resolve(result);
  });
  productsApi.list.mockResolvedValue({
    items: [
      {
        id: "15",
        sku: "MAY-1",
        name: "Arroz mayorista",
        unit: "bulto",
        salePrice: "1250.50",
        minimumSaleEnabled: true,
        minimumSaleQuantity: 5,
      },
    ],
    pagination: { page: 1, pageCount: 1 },
  });
  productsApi.balances.mockResolvedValue({
    items: [{ warehouseId: "8", quantity: 2, hasBalance: true }],
  });
  salesApi.create.mockResolvedValue({
    id: "20",
    number: "VE-000020",
    status: "draft",
    version: 1,
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/ventas/nueva"]}>
        <Routes>
          <Route path="/ventas/nueva" element={<SaleFormPage />} />
          <Route path="/ventas/:id" element={<p>Detalle</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("SaleFormPage", () => {
  afterEach(() => {
    cleanup();
    clearPendingOperationStorage();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("validates the configured wholesale minimum and saves a draft with the suggested COP price", async () => {
    const user = userEvent.setup();
    renderForm();
    await screen.findByRole("button", { name: /Arroz mayorista/ });
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Cliente" }),
      "4",
    );
    await user.selectOptions(screen.getByLabelText("Bodega"), "8");
    await user.click(screen.getByRole("button", { name: /Arroz mayorista/ }));
    expect(
      await screen.findByText(/Existencia orientativa: 2 bulto · no reservada/),
    ).toBeInTheDocument();
    const quantity = screen.getByRole("spinbutton", {
      name: "Cantidad de Arroz mayorista",
    });
    await user.clear(quantity);
    await user.type(quantity, "3");
    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));
    expect(
      await screen.findByText("La cantidad mínima es 5."),
    ).toBeInTheDocument();
    expect(salesApi.create).not.toHaveBeenCalled();

    await user.clear(quantity);
    await user.type(quantity, "5");
    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));
    await waitFor(() => expect(salesApi.create).toHaveBeenCalledTimes(1));
    expect(salesApi.create.mock.calls[0][0]).toMatchObject({
      customerId: "4",
      warehouseId: "8",
      lines: [{ productId: "15", quantity: 5, unitPrice: "1250.50" }],
    });
    expect(salesApi.create.mock.calls[0][1]).toEqual(expect.any(String));
    expect(await screen.findByText("Detalle")).toBeInTheDocument();
  });

  it("permite seleccionar una bodega activa autorizada en la segunda página", async () => {
    const first = Array.from({ length: 100 }, (_, index) => ({
      id: String(index + 1),
      name: `Bodega ${index + 1}`,
    }));
    renderForm({
      1: {
        items: first,
        pagination: { page: 1, pageSize: 100, total: 101, pageCount: 2 },
      },
      2: {
        items: [{ id: "101", name: "Bodega Final" }],
        pagination: { page: 2, pageSize: 100, total: 101, pageCount: 2 },
      },
    });
    expect(
      await screen.findByRole("option", { name: "Bodega Final" }),
    ).toHaveValue("101");
  });

  it("permite reintentar si no puede cargar las bodegas de la venta", async () => {
    renderForm({ 1: new Error("sin red") });
    const select = screen.getByRole("combobox", { name: "Bodega" });
    expect(
      await screen.findByRole("button", { name: "Reintentar bodegas" }),
    ).toBeInTheDocument();
    expect(select).toBeDisabled();
    warehousesApi.list.mockResolvedValue({
      items: [{ id: "8", name: "Bodega Norte" }],
      pagination: { page: 1, pageSize: 100, total: 1, pageCount: 1 },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Reintentar bodegas" }),
    );
    expect(
      await screen.findByRole("option", { name: "Bodega Norte" }),
    ).toHaveValue("8");
  });
});
