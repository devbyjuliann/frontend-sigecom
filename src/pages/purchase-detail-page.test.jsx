import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PurchaseDetailPage from "./purchase-detail-page.jsx";
import { purchasesApi } from "../lib/auth-api.js";
import { useAuth } from "../auth/auth-context.jsx";

vi.mock("../lib/auth-api.js", () => ({
  ApiError: class ApiError extends Error {},
  purchasesApi: {
    get: vi.fn(),
    confirm: vi.fn(),
    cancel: vi.fn(),
    updateCommercialCode: vi.fn(),
    receipts: vi.fn(),
    receive: vi.fn(),
  },
}));
vi.mock("../auth/auth-context.jsx", () => ({ useAuth: vi.fn() }));

function renderPage(orderOverrides = {}, onClient) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  useAuth.mockReturnValue({
    session: {
      user: { role: "administrator" },
      permissions: ["purchases.read", "purchases.receive", "purchases.create"],
    },
  });
  purchasesApi.get.mockResolvedValue({
    id: "12",
    number: "OC-000012",
    version: 3,
    status: "confirmed",
    orderDate: "2026-10-29",
    supplierName: "Proveedor Norte",
    supplierIdentification: "900123456",
    warehouseName: "Bodega Central",
    lines: [
      {
        id: "31",
        name: "Arroz",
        sku: "ARR-1",
        unit: "bulto",
        quantity: 8,
        receivedQuantity: 3,
        pendingQuantity: 5,
        unitCost: "100.00",
        lineTotal: "800.00",
      },
    ],
    ...orderOverrides,
  });
  purchasesApi.receipts.mockResolvedValue({ items: [] });
  onClient?.(client);
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/compras/12"]}>
        <Routes>
          <Route path="/compras/:id" element={<PurchaseDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PurchaseDetailPage receipts", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows ordered, received and pending quantities and requires a review", async () => {
    let client;
    renderPage({}, (queryClient) => {
      client = queryClient;
    });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    expect(
      await screen.findByRole("heading", { name: "Recepciones de mercancía" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Bodega Central")).toBeInTheDocument();
    const orderTable = screen.getByRole("table", {
      name: "Productos de la orden",
    });
    expect(
      within(orderTable).getByRole("columnheader", { name: "SKU" }),
    ).toBeInTheDocument();
    expect(
      within(orderTable).getByRole("columnheader", { name: "Unidad" }),
    ).toBeInTheDocument();
    expect(within(orderTable).getByText("ARR-1")).toBeInTheDocument();
    expect(within(orderTable).getByText("bulto")).toBeInTheDocument();
    const partialRow = within(orderTable).getByRole("row", {
      name: /Arroz ARR-1 bulto/,
    });
    expect(
      within(partialRow)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual([
      "Arroz",
      "ARR-1",
      "bulto",
      "8",
      "3",
      "5",
      "$ 100,00",
      "$ 800,00",
    ]);
    expect(
      await screen.findByText("Aún no se han registrado recepciones."),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /registrar recepción/i }),
    );
    fireEvent.change(screen.getByLabelText("Referencia de entrega *"), {
      target: { value: "REM-778" },
    });
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Cantidad recibida de Arroz" }),
      {
        target: { value: "5" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Revisar recepción" }));
    const review = await screen.findByRole("dialog", {
      name: "Revisar recepción",
    });
    expect(within(review).getByText(/REM-778/)).toBeInTheDocument();
    expect(within(review).getByText("5 / 5 pendientes")).toBeInTheDocument();
    expect(
      within(review).getByRole("button", { name: "Confirmar recepción" }),
    ).toBeEnabled();
    purchasesApi.receive
      .mockRejectedValueOnce({ status: 0, message: "Sin conexión" })
      .mockResolvedValue({
        id: "55",
        replayed: false,
        lines: [{ quantity: 5 }],
      });
    fireEvent.click(
      within(review).getByRole("button", { name: "Confirmar recepción" }),
    );
    await waitFor(() => expect(purchasesApi.receive).toHaveBeenCalledTimes(1));
    fireEvent.click(
      await screen.findByRole("button", { name: "Reintentar recepción" }),
    );
    await waitFor(() => expect(purchasesApi.receive).toHaveBeenCalledTimes(2));
    const [orderId, payload, key] = purchasesApi.receive.mock.calls[0];
    expect(orderId).toBe("12");
    expect(payload).toMatchObject({
      expectedVersion: 3,
      reference: "REM-778",
      lines: [{ purchaseOrderLineId: "31", quantity: 5 }],
    });
    expect(key).toEqual(expect.any(String));
    expect(purchasesApi.receive.mock.calls[1][1]).toEqual(payload);
    expect(purchasesApi.receive.mock.calls[1][2]).toBe(key);
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ["purchase-orders"] }),
      ),
    );
  });

  it("allows an administrator to update the commercial code without changing the internal ID", async () => {
    renderPage();
    expect(
      await screen.findByText(/Código comercial · OC-000012/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Identificador interno inmutable: 12"),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Editar código comercial" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Editar código comercial",
    });
    const input = within(dialog).getByLabelText("Código comercial");
    fireEvent.change(input, { target: { value: "OC-NORTE-42" } });
    purchasesApi.updateCommercialCode.mockResolvedValue({
      id: "12",
      number: "OC-NORTE-42",
      version: 4,
      status: "confirmed",
      orderDate: "2026-10-29",
      total: "0.00",
      supplierName: "Proveedor Norte",
      supplierIdentification: "900123456",
      warehouseName: "Bodega Central",
      lines: [],
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Guardar código" }),
    );
    await waitFor(() =>
      expect(purchasesApi.updateCommercialCode).toHaveBeenCalledWith("12", {
        commercialCode: "OC-NORTE-42",
        expectedVersion: 3,
      }),
    );
    expect(
      await screen.findByText(/Código comercial · OC-NORTE-42/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Identificador interno inmutable: 12"),
    ).toBeInTheDocument();
  });

  it("shows zero received and full pending when there are no receipts", async () => {
    renderPage({
      lines: [
        {
          id: "31",
          name: "Arroz",
          sku: "ARR-1",
          unit: "bulto",
          quantity: 8,
          receivedQuantity: 0,
          pendingQuantity: 8,
          unitCost: "100.00",
          lineTotal: "800.00",
        },
      ],
    });
    const table = await screen.findByRole("table", {
      name: "Productos de la orden",
    });
    const row = within(table).getByRole("row", { name: /Arroz ARR-1 bulto/ });
    expect(
      within(row)
        .getAllByRole("cell")
        .map((cell) => cell.textContent)
        .slice(3, 6),
    ).toEqual(["8", "0", "8"]);
  });

  it("shows zero pending for a completely received order", async () => {
    renderPage({
      lines: [
        {
          id: "31",
          name: "Arroz",
          sku: "ARR-1",
          unit: "bulto",
          quantity: 8,
          receivedQuantity: 8,
          pendingQuantity: 0,
          unitCost: "100.00",
          lineTotal: "800.00",
        },
      ],
    });
    const table = await screen.findByRole("table", {
      name: "Productos de la orden",
    });
    const row = within(table).getByRole("row", { name: /Arroz ARR-1 bulto/ });
    expect(
      within(row)
        .getAllByRole("cell")
        .map((cell) => cell.textContent)
        .slice(3, 6),
    ).toEqual(["8", "8", "0"]);
  });
});
