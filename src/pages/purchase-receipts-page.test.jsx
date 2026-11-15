import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import PurchaseReceiptsPage from "./purchase-receipts-page.jsx";
import { useAuth } from "../auth/auth-context.jsx";
import { ApiError, reportApi } from "../lib/auth-api.js";
import { createCsv, downloadCsv } from "../lib/csv.js";

vi.mock("../auth/auth-context.jsx", () => ({ useAuth: vi.fn() }));
vi.mock("../lib/auth-api.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    reportApi: {
      purchaseReceipts: vi.fn(),
      purchaseReceiptWarehouses: vi.fn(),
    },
  };
});
vi.mock("../lib/csv.js", () => ({
  createCsv: vi.fn(() => "purchase-csv"),
  downloadCsv: vi.fn(),
}));

const result = (page = 1) => ({
  period: {
    dateFrom: "2026-10-06",
    dateTo: "2026-11-04",
    timeZone: "America/Bogota",
  },
  criteria: { currency: "COP" },
  summary: {
    receivedValue: "49.36",
    supplierReturnEquivalent: "49.61",
    referenceNetReceivedValue: "-0.25",
    quantitiesByUnit: [
      {
        unit: "Caja",
        quantityReceived: "4",
        quantityReturned: "7",
        quantityDifference: "-3",
      },
      {
        unit: "Unidad",
        quantityReceived: "9007199254740993",
        quantityReturned: "1",
        quantityDifference: "9007199254740992",
      },
    ],
  },
  activities: [
    {
      id: "supplier_return:91",
      type: "supplier_return",
      occurredAt: "2026-11-04T15:00:00.000Z",
      sourceId: "91",
      purchaseOrderId: "80",
      purchaseReceiptId: "86",
      supplierReturnId: "91",
      warehouse: { id: "12", code: "B-1", name: "Bodega Norte" },
      amount: "49.61",
      quantitiesByUnit: [{ unit: "Caja", quantityReturned: "7" }],
    },
    {
      id: "purchase_receipt:86",
      type: "purchase_receipt",
      occurredAt: "2026-11-03T15:00:00.000Z",
      sourceId: "86",
      purchaseOrderId: "80",
      purchaseReceiptId: "86",
      supplierReturnId: null,
      warehouse: { id: "12", code: "B-1", name: "Bodega Norte" },
      amount: "49.36",
      quantitiesByUnit: [{ unit: "Caja", quantityReceived: "4" }],
    },
  ],
  pagination: { page, pageSize: 20, total: 21, totalPages: 2 },
  generatedAt: "2026-11-04T16:00:00.000Z",
});

function renderPage({
  permissions = ["reports.read", "warehouses.read", "purchases.read"],
  userId = "7",
} = {}) {
  useAuth.mockReturnValue({
    session: { user: { id: userId, role: "administrator" }, permissions },
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PurchaseReceiptsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-11-04T18:00:00.000Z"));
  reportApi.purchaseReceipts.mockImplementation(async (filters) =>
    result(filters.page),
  );
  reportApi.purchaseReceiptWarehouses.mockResolvedValue({
    items: [
      { id: "12", code: "B-1", name: "Bodega Norte", isActive: false },
      { id: "13", code: "B-2", name: "Bodega Sur", isActive: true },
    ],
    pagination: { page: 1, pageSize: 20, total: 21, totalPages: 2 },
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

it("renders exact API indicators, policy clarifications, unit-separated signed differences and both document types", async () => {
  renderPage();
  const table = await screen.findByRole("region", {
    name: "Tabla de Recepciones y Devoluciones de Compras",
  });
  expect(screen.getAllByText(/49,36/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/49,61/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/-.*0,25/).length).toBeGreaterThan(0);
  expect(
    screen.getByText(
      "Este valor no representa necesariamente dinero reembolsado por el proveedor.",
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      /No representa compras netas contables, utilidad ni saldo de caja/,
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      "El reporte incluye únicamente recepciones y devoluciones cuya trazabilidad documental e inventario asociado pudieron verificarse.",
    ),
  ).toBeInTheDocument();
  expect(screen.getByText("-3")).toBeInTheDocument();
  expect(screen.getByText("9.007.199.254.740.993")).toBeInTheDocument();
  expect(within(table).getByText("Devolución a proveedor")).toBeInTheDocument();
  expect(within(table).getByText("Recepción de mercancía")).toBeInTheDocument();
  expect(within(table).getAllByText("Orden #80")).toHaveLength(2);
  expect(within(table).getByText("Devolución #91")).toBeInTheDocument();
  expect(within(table).getByText("Recepción #86")).toBeInTheDocument();
});

it("exports all filtered purchase activity within the explicit cap", async () => {
  renderPage();
  await screen.findByRole("region", {
    name: "Tabla de Recepciones y Devoluciones de Compras",
  });

  reportApi.purchaseReceipts.mockResolvedValueOnce({
    ...result(1),
    pagination: { page: 1, pageSize: 100, total: 2, totalPages: 1 },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Exportar resultados (CSV)" }),
  );

  await waitFor(() =>
    expect(createCsv).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          document: "Devolución #91",
          order: "80",
          warehouse: "B-1 · Bodega Norte",
          amount: "49.61",
        }),
      ]),
      expect.arrayContaining([
        expect.objectContaining({ label: "Fecha" }),
        expect.objectContaining({ label: "Tipo de actividad" }),
      ]),
    ),
  );
  expect(downloadCsv).toHaveBeenCalledWith(
    expect.stringMatching(
      /^actividad-compras-completa-\d{4}-\d{2}-\d{2}\.csv$/,
    ),
    "purchase-csv",
  );
});

it("uses Bogotá defaults, the purchase-only warehouse endpoint, and paginates on the server", async () => {
  renderPage();
  await screen.findByRole("region", {
    name: "Tabla de Recepciones y Devoluciones de Compras",
  });
  expect(screen.getByLabelText("Desde")).toHaveValue("2026-10-06");
  expect(screen.getByLabelText("Hasta")).toHaveValue("2026-11-04");
  expect(reportApi.purchaseReceiptWarehouses).toHaveBeenCalledWith(
    { q: "", page: 1, pageSize: 20 },
    expect.anything(),
  );
  fireEvent.change(screen.getByLabelText("Bodega"), {
    target: { value: "12" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
  await waitFor(() =>
    expect(reportApi.purchaseReceipts).toHaveBeenLastCalledWith(
      expect.objectContaining({ warehouseId: "12", page: 1, pageSize: 20 }),
      expect.anything(),
    ),
  );
  expect(
    screen.getByRole("option", { name: "Bodega Norte · Inactiva" }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole("button", { name: "Siguiente" })[1]);
  await waitFor(() =>
    expect(reportApi.purchaseReceipts).toHaveBeenLastCalledWith(
      expect.objectContaining({ warehouseId: "12", page: 2 }),
      expect.anything(),
    ),
  );
});

it("rejects invalid periods without sending a request", async () => {
  renderPage();
  await screen.findByRole("region", {
    name: "Tabla de Recepciones y Devoluciones de Compras",
  });
  const before = reportApi.purchaseReceipts.mock.calls.length;
  fireEvent.change(screen.getByLabelText("Desde"), {
    target: { value: "2026-01-01" },
  });
  fireEvent.change(screen.getByLabelText("Hasta"), {
    target: { value: "2026-04-03" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
  expect(screen.getByRole("alert")).toHaveTextContent("92 días calendario");
  expect(reportApi.purchaseReceipts).toHaveBeenCalledTimes(before);
});

it.each([401, 403])(
  "hides all purchase data when the API denies access with %s",
  async (status) => {
    reportApi.purchaseReceipts.mockRejectedValueOnce(
      new ApiError({
        status,
        code: status === 401 ? "SESSION_INVALID" : "PERMISSION_DENIED",
        message: "Denied",
      }),
    );
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      status === 401 ? "La sesión venció" : "Acceso denegado",
    );
    expect(
      screen.queryByRole("region", {
        name: "Tabla de Recepciones y Devoluciones de Compras",
      }),
    ).not.toBeInTheDocument();
  },
);

it("clears report queries when identity or effective permissions change", async () => {
  const { queryClient, rerender } = renderPage();
  await screen.findByRole("region", {
    name: "Tabla de Recepciones y Devoluciones de Compras",
  });
  const previousIdentity = JSON.stringify({
    id: "7",
    role: "administrator",
    permissions: ["purchases.read", "reports.read", "warehouses.read"],
  });
  expect(
    queryClient.getQueryCache().findAll({ queryKey: ["purchase-receipts"] })
      .length,
  ).toBeGreaterThan(0);
  useAuth.mockReturnValue({
    session: {
      user: { id: "8", role: "administrator" },
      permissions: ["reports.read", "warehouses.read"],
    },
  });
  rerender(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PurchaseReceiptsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(
      queryClient
        .getQueryCache()
        .findAll({ queryKey: ["purchase-receipts"] })
        .some((query) => query.queryKey.includes(previousIdentity)),
    ).toBe(false),
  );
});
