import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import ReportsPage from "./reports-page.jsx";
import { useAuth } from "../auth/auth-context.jsx";
import { reportApi } from "../lib/auth-api.js";

vi.mock("../auth/auth-context.jsx", () => ({ useAuth: vi.fn() }));
vi.mock("../lib/auth-api.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    reportApi: {
      purchaseReceipts: vi.fn(),
      purchaseReceiptWarehouses: vi.fn(),
      salesActivity: vi.fn(),
      salesActivityWarehouses: vi.fn(),
    },
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderHub(permissions, role = "administrator") {
  useAuth.mockReturnValue({
    session: { user: { id: "u-1", role }, permissions },
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ReportsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const purchaseResult = {
  summary: {
    receivedValue: "0.00",
    supplierReturnEquivalent: "0.00",
    referenceNetReceivedValue: "0.00",
    quantitiesByUnit: [],
  },
  activities: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  generatedAt: "2026-01-01T12:00:00.000Z",
  period: { timeZone: "America/Bogota" },
  criteria: {},
};

it("automatically mounts only Compras when sales.read is absent", async () => {
  reportApi.purchaseReceipts.mockResolvedValue(purchaseResult);
  reportApi.purchaseReceiptWarehouses.mockResolvedValue({
    items: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  });
  renderHub(["reports.read", "warehouses.read", "purchases.read"]);
  expect(screen.getByLabelText("Tipo de reporte")).toHaveValue("purchases");
  expect(
    await screen.findByRole("heading", {
      level: 2,
      name: "Recepciones y Devoluciones de Compras",
    }),
  ).toBeInTheDocument();
  expect(reportApi.purchaseReceipts).toHaveBeenCalled();
  expect(reportApi.salesActivity).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("option", { name: "Actividad de Ventas" }),
  ).not.toBeInTheDocument();
});

it("shows only Actividad de Ventas when purchases.read is absent", async () => {
  reportApi.salesActivity.mockResolvedValue({
    summary: {
      grossConfirmed: "0.00",
      cancellations: "0.00",
      returnEquivalent: "0.00",
      referenceCommercialBalance: "0.00",
      quantitiesByUnit: [],
    },
    activities: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    generatedAt: "2026-01-01T12:00:00.000Z",
  });
  reportApi.salesActivityWarehouses.mockResolvedValue({
    items: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  });
  renderHub(["reports.read", "warehouses.read", "sales.read"]);
  expect(
    await screen.findByRole("heading", {
      level: 2,
      name: "Actividad de Ventas",
    }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("option", {
      name: "Recepciones y Devoluciones de Compras",
    }),
  ).not.toBeInTheDocument();
  expect(reportApi.salesActivity).toHaveBeenCalled();
  expect(reportApi.purchaseReceipts).not.toHaveBeenCalled();
});

it("shows both authorized report types and mounts only the selected report", async () => {
  reportApi.salesActivity.mockResolvedValue({
    summary: {
      grossConfirmed: "0.00",
      cancellations: "0.00",
      returnEquivalent: "0.00",
      referenceCommercialBalance: "0.00",
      quantitiesByUnit: [],
    },
    activities: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    generatedAt: "2026-01-01T12:00:00.000Z",
  });
  reportApi.salesActivityWarehouses.mockResolvedValue({
    items: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  });
  reportApi.purchaseReceipts.mockResolvedValue(purchaseResult);
  reportApi.purchaseReceiptWarehouses.mockResolvedValue({
    items: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  });
  const user = userEvent.setup();
  renderHub([
    "reports.read",
    "warehouses.read",
    "sales.read",
    "purchases.read",
  ]);
  expect(
    await screen.findByRole("heading", {
      level: 2,
      name: "Actividad de Ventas",
    }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("option", {
      name: "Recepciones y Devoluciones de Compras",
    }),
  ).toBeInTheDocument();
  await user.selectOptions(
    screen.getByLabelText("Tipo de reporte"),
    "purchases",
  );
  expect(
    await screen.findByRole("heading", {
      level: 2,
      name: "Recepciones y Devoluciones de Compras",
    }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("region", { name: "Tabla de Actividad de Ventas" }),
  ).not.toBeInTheDocument();
  await waitFor(() => expect(reportApi.purchaseReceipts).toHaveBeenCalled());
});

it("does not call commercial endpoints when the user has no specific report permission", () => {
  renderHub(["reports.read", "warehouses.read"]);
  expect(screen.getByRole("status")).toHaveTextContent(
    "No tienes reportes disponibles",
  );
  expect(screen.queryByLabelText("Tipo de reporte")).not.toBeInTheDocument();
  expect(reportApi.salesActivity).not.toHaveBeenCalled();
  expect(reportApi.purchaseReceipts).not.toHaveBeenCalled();
});
