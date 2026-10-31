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

vi.mock("../lib/auth-api.js", () => ({
  ApiError: class ApiError extends Error {},
  customersApi: { list: vi.fn() },
  productsApi: { list: vi.fn(), balances: vi.fn() },
  salesApi: { get: vi.fn(), create: vi.fn(), update: vi.fn() },
  warehousesApi: { list: vi.fn() },
}));

function renderForm() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  customersApi.list.mockResolvedValue({
    items: [
      { id: "4", name: "Cliente Mayorista", identificationNumber: "900123" },
    ],
    pagination: { page: 1, pageCount: 1 },
  });
  warehousesApi.list.mockResolvedValue({
    items: [{ id: "8", name: "Bodega Norte" }],
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
});
