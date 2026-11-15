import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import PurchaseOrdersPage from "./purchase-orders-page.jsx";
import { useAuth } from "../auth/auth-context.jsx";
import { reportApi } from "../lib/auth-api.js";
import { createCsv, downloadCsv } from "../lib/csv.js";

vi.mock("../auth/auth-context.jsx", () => ({ useAuth: vi.fn() }));
vi.mock("../lib/auth-api.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    reportApi: { purchaseOrders: vi.fn(), purchaseReceiptWarehouses: vi.fn() },
  };
});
vi.mock("../lib/csv.js", () => ({
  createCsv: vi.fn(() => "purchase-orders-csv"),
  downloadCsv: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const emptyResult = {
  summary: {
    verifiedOrders: "0",
    byDocumentStatus: { draft: "0", confirmed: "0", cancelled: "0" },
    bySituation: {},
    ordersWithPending: "0",
    ordersClosedWithRemnant: "0",
    originalConfirmedOrderValue: "0.00",
    pendingByUnit: [],
    closedByUnit: [],
  },
  orders: [],
  pagination: { page: 1, pageSize: 20, total: "0", totalPages: "0" },
  generatedAt: "2026-11-06T12:00:00.000Z",
};
function renderPage() {
  useAuth.mockReturnValue({
    session: {
      user: { id: "u-1", role: "auditor" },
      permissions: ["reports.read", "warehouses.read", "purchases.read"],
    },
  });
  reportApi.purchaseOrders.mockResolvedValue(emptyResult);
  reportApi.purchaseReceiptWarehouses.mockResolvedValue({
    items: [{ id: "w-1", code: "B01", name: "Principal", isActive: true }],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PurchaseOrdersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it("starts in current-pending mode and omits date filters from the API request", async () => {
  renderPage();
  expect(screen.getByLabelText("Modalidad")).toHaveValue("pending");
  expect(screen.queryByLabelText("Desde")).not.toBeInTheDocument();
  await screen.findByText("Órdenes verificables");
  expect(reportApi.purchaseOrders).toHaveBeenCalledWith(
    expect.objectContaining({ mode: "pending", page: 1, pageSize: 20 }),
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  expect(reportApi.purchaseOrders.mock.calls[0][0]).not.toHaveProperty(
    "dateFrom",
  );
  expect(
    screen.getByText(/pendientes actuales de todas las fechas documentales/i),
  ).toBeInTheDocument();
});

it("requires dates and accepts the inclusive 92-day maximum", async () => {
  const user = userEvent.setup();
  renderPage();
  await screen.findByText("Órdenes verificables");
  await user.selectOptions(screen.getByLabelText("Modalidad"), "period");
  await user.clear(screen.getByLabelText("Desde"));
  await user.type(screen.getByLabelText("Desde"), "2026-01-01");
  await user.clear(screen.getByLabelText("Hasta"));
  await user.type(screen.getByLabelText("Hasta"), "2026-04-02");
  await user.click(screen.getByRole("button", { name: "Consultar" }));
  await waitFor(() =>
    expect(reportApi.purchaseOrders).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "period",
        dateFrom: "2026-01-01",
        dateTo: "2026-04-02",
      }),
      expect.anything(),
    ),
  );
  await user.clear(screen.getByLabelText("Hasta"));
  await user.type(screen.getByLabelText("Hasta"), "2026-04-03");
  await user.click(screen.getByRole("button", { name: "Consultar" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    /máximo inclusivo de 92 días/,
  );
});

it("renders actual pending, received and closed quantities without conflating remnant and pending", async () => {
  reportApi.purchaseOrders.mockResolvedValueOnce({
    ...emptyResult,
    summary: {
      ...emptyResult.summary,
      verifiedOrders: "1",
      ordersWithPending: "0",
      ordersClosedWithRemnant: "1",
      originalConfirmedOrderValue: "99999999999999999999.99",
      pendingByUnit: [],
      closedByUnit: [{ unit: "caja", quantity: "9007199254740993" }],
    },
    orders: [
      {
        id: "42",
        commercialCode: "OC-42",
        orderDate: "2026-01-12",
        warehouse: { code: "B01", name: "Principal" },
        status: "confirmed",
        situation: "closed_with_remnant",
        orderedValue: "99999999999999999999.99",
        lines: [
          {
            id: "1",
            name: "Producto",
            sku: "SKU-1",
            unit: "caja",
            quantity: "5",
            receivedQuantity: "4",
            pendingQuantity: "0",
            closedQuantity: "1",
            unitCost: "10.00",
            lineTotal: "50.00",
          },
        ],
      },
    ],
  });
  const user = userEvent.setup();
  renderPage();
  expect(await screen.findByText("OC-42")).toBeInTheDocument();
  expect(screen.getByText("Cerrada con remanente")).toBeInTheDocument();
  expect(screen.getByText(/9\.007\.199\.254\.740\.993/)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Consultar líneas/ }));
  expect(screen.getByText("Remanente cerrado")).toBeInTheDocument();
  expect(screen.getAllByText("0").length).toBeGreaterThan(0);
  expect(screen.getAllByText("1").length).toBeGreaterThan(0);
});

it("exports only the currently filtered purchase-order page to CSV", async () => {
  const filteredResult = {
    ...emptyResult,
    orders: [
      {
        id: "42",
        commercialCode: "OC-42",
        orderDate: "2026-01-12",
        warehouse: { code: "B01", name: "Principal" },
        status: "confirmed",
        situation: "closed_with_remnant",
        orderedValue: "50.00",
        lines: [],
      },
    ],
    pagination: { page: 1, pageSize: 20, total: "1", totalPages: "1" },
  };
  const user = userEvent.setup();
  renderPage();
  await screen.findByText("Órdenes verificables");
  reportApi.purchaseOrders.mockResolvedValue(filteredResult);
  await user.type(
    screen.getByLabelText("Referencia comercial actual"),
    "OC-42",
  );
  await user.click(screen.getByRole("button", { name: "Consultar" }));
  expect(await screen.findByText("OC-42")).toBeInTheDocument();
  await waitFor(() =>
    expect(reportApi.purchaseOrders).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: "OC-42", page: 1 }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    ),
  );

  await user.click(
    screen.getByRole("button", { name: "Exportar resultados (CSV)" }),
  );

  await waitFor(() =>
    expect(createCsv).toHaveBeenCalledWith(
      [
        {
          code: "OC-42",
          orderDate: "2026-01-12",
          warehouse: "B01 · Principal",
          status: "Confirmada",
          situation: "Cerrada con remanente",
          orderedValue: "50.00",
        },
      ],
      expect.arrayContaining([
        expect.objectContaining({ label: "Código de orden" }),
        expect.objectContaining({ label: "Bodega" }),
        expect.objectContaining({ label: "Valor original COP" }),
      ]),
    ),
  );
  expect(downloadCsv).toHaveBeenCalledWith(
    expect.stringMatching(/^ordenes-compra-completas-\d{4}-\d{2}-\d{2}\.csv$/),
    "purchase-orders-csv",
  );
});
