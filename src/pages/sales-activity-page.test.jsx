import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SalesActivityPage from "./sales-activity-page.jsx";
import { useAuth } from "../auth/auth-context.jsx";
import { reportApi } from "../lib/auth-api.js";
import { ApiError } from "../lib/auth-api.js";

vi.mock("../auth/auth-context.jsx", () => ({ useAuth: vi.fn() }));
vi.mock("../lib/auth-api.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    reportApi: { salesActivity: vi.fn(), salesActivityWarehouses: vi.fn() },
  };
});

const activityResponse = (page = 1) => ({
  period: {
    dateFrom: "2026-01-01",
    dateTo: "2026-01-30",
    timeZone: "America/Bogota",
  },
  criteria: {
    currency: "COP",
    periodSemantics:
      "Fechas inclusivas de America/Bogota; máximo 92 días calendario, contando ambos extremos.",
    calculation:
      "Bruto por fecha de confirmación; anulaciones por fecha de anulación; devoluciones equivalentes por fecha de devolución.",
    returnEquivalentMeaning: "No representa necesariamente dinero reembolsado.",
    referenceBalanceMeaning:
      "Referencia comercial; no es un resultado contable.",
  },
  summary: {
    grossConfirmed: "10000000000051.25",
    cancellations: "10000000000000.00",
    returnEquivalent: "10000000000048.85",
    referenceCommercialBalance: "-9999999999997.60",
    quantitiesByUnit: [
      {
        unit: "unidad",
        quantityReceived: "9007199254740993",
        quantityRestocked: "2",
      },
      { unit: "caja", quantityReceived: "3", quantityRestocked: "1" },
    ],
  },
  activities: [
    {
      id: "customer-return:9223372036854775807",
      type: "customer_return",
      occurredAt: "2026-01-10T05:00:00.000Z",
      sale: { id: "18446744073709551614", number: "V-0007" },
      sourceId: "9223372036854775807",
      warehouse: { id: "12", code: "BOD-1", name: "Bodega Norte" },
      amount: "10.25",
      quantitiesByUnit: [
        { unit: "unidad", quantityReceived: "2", quantityRestocked: "1" },
      ],
    },
  ],
  pagination: { page, pageSize: 20, total: 21, totalPages: 2 },
  generatedAt: "2026-01-30T15:00:00.000Z",
});

function renderPage(
  role = "administrator",
  permissions = ["reports.read", "sales.read", "warehouses.read"],
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  useAuth.mockReturnValue({
    session: { user: { id: "7", role }, permissions },
  });
  reportApi.salesActivity.mockImplementation(async (filters) =>
    activityResponse(filters.page),
  );
  reportApi.salesActivityWarehouses.mockResolvedValue({
    items: [
      { id: "12", code: "BOD-1", name: "Bodega Norte", isActive: false },
      { id: "13", code: "BOD-2", name: "Bodega Sur", isActive: true },
    ],
    pagination: { page: 1, pageSize: 20, total: 21, totalPages: 2 },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SalesActivityPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-01-01T03:00:00.000Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("Sales activity report page", () => {
  it("shows the 30-day Bogotá range, exact money, commercial clarifications, and unit-separated return quantities", async () => {
    renderPage();
    await screen.findByRole("region", { name: "Tabla de Actividad de Ventas" });
    expect(screen.getByLabelText("Desde")).toHaveValue("2025-12-02");
    expect(screen.getByLabelText("Hasta")).toHaveValue("2025-12-31");
    expect(reportApi.salesActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        dateFrom: "2025-12-02",
        dateTo: "2025-12-31",
        page: 1,
        pageSize: 20,
      }),
      expect.anything(),
    );
    expect(screen.getByText(/10\.000\.000\.000\.051,25/)).toBeInTheDocument();
    expect(screen.getByText(/-.*9\.999\.999\.999\.997,60/)).toBeInTheDocument();
    expect(
      screen.getByText(
        "Este valor no representa necesariamente dinero reembolsado al cliente.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /No representa utilidad, ventas netas contables ni saldo de caja/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("9.007.199.254.740.993")).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Bodega Norte · Inactiva" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /V-0007/ }),
    ).not.toBeInTheDocument();
  });

  it("applies filters and requests the next server page without changing the full-period summary", async () => {
    renderPage("auditor");
    await screen.findByRole("region", { name: "Tabla de Actividad de Ventas" });
    const summary = screen.getByText(/10\.000\.000\.000\.051,25/).textContent;
    fireEvent.change(screen.getByLabelText("Desde"), {
      target: { value: "2026-01-01" },
    });
    fireEvent.change(screen.getByLabelText("Hasta"), {
      target: { value: "2026-04-02" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
    await waitFor(() =>
      expect(reportApi.salesActivity).toHaveBeenLastCalledWith(
        expect.objectContaining({
          dateFrom: "2026-01-01",
          dateTo: "2026-04-02",
          page: 1,
        }),
        expect.anything(),
      ),
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Siguiente" })[1]);
    await waitFor(() =>
      expect(reportApi.salesActivity).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 }),
        expect.anything(),
      ),
    );
    expect(screen.getByText(/10\.000\.000\.000\.051,25/).textContent).toBe(
      summary,
    );
  });

  it("does not apply invalid ranges and can restore the Bogotá default with Limpiar filtros", async () => {
    renderPage();
    await screen.findByRole("region", { name: "Tabla de Actividad de Ventas" });
    const initialCalls = reportApi.salesActivity.mock.calls.length;
    fireEvent.change(screen.getByLabelText("Desde"), {
      target: { value: "2026-01-01" },
    });
    fireEvent.change(screen.getByLabelText("Hasta"), {
      target: { value: "2026-04-03" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
    expect(screen.getByRole("alert")).toHaveTextContent("92 días calendario");
    expect(reportApi.salesActivity).toHaveBeenCalledTimes(initialCalls);
    fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect(screen.getByLabelText("Desde")).toHaveValue("2025-12-02");
    expect(screen.getByLabelText("Hasta")).toHaveValue("2025-12-31");
  });

  it("searches and paginates only the assigned-warehouse endpoint, then applies the selected warehouse", async () => {
    const { getByLabelText, getByRole, getByText } = renderPage();
    await screen.findByRole("region", { name: "Tabla de Actividad de Ventas" });
    fireEvent.change(getByLabelText("Buscar en mis bodegas"), {
      target: { value: "Sur" },
    });
    fireEvent.click(getByRole("button", { name: "Buscar" }));
    await waitFor(() =>
      expect(reportApi.salesActivityWarehouses).toHaveBeenLastCalledWith(
        { q: "Sur", page: 1, pageSize: 20 },
        expect.anything(),
      ),
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Siguiente" })[0]);
    await waitFor(() =>
      expect(reportApi.salesActivityWarehouses).toHaveBeenLastCalledWith(
        { q: "Sur", page: 2, pageSize: 20 },
        expect.anything(),
      ),
    );
    fireEvent.change(getByLabelText("Bodega", { exact: true }), {
      target: { value: "12" },
    });
    fireEvent.click(getByRole("button", { name: "Consultar" }));
    await waitFor(() =>
      expect(reportApi.salesActivity).toHaveBeenLastCalledWith(
        expect.objectContaining({ warehouseId: "12", page: 1 }),
        expect.anything(),
      ),
    );
    expect(getByText("Todas mis bodegas")).toBeInTheDocument();
  });

  it("shows a clear empty state when the API has no activities or returned quantities", async () => {
    reportApi.salesActivity.mockResolvedValueOnce({
      ...activityResponse(),
      activities: [],
      summary: { ...activityResponse().summary, quantitiesByUnit: [] },
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    });
    renderPage();
    expect(
      await screen.findByText(
        "No hay actividades de ventas para este período y alcance.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "No se registran devoluciones en el período consultado.",
      ),
    ).toBeInTheDocument();
  });

  it("renders a useful API error without leaving previous result data visible", async () => {
    reportApi.salesActivity.mockRejectedValueOnce(
      new Error("No se pudo conectar con SIGECOM."),
    );
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo conectar con SIGECOM.",
    );
    expect(
      screen.queryByRole("region", { name: "Tabla de Actividad de Ventas" }),
    ).not.toBeInTheDocument();
  });

  it.each([401, 403])(
    "hides report data after the server returns authorization status %s",
    async (status) => {
      reportApi.salesActivity.mockRejectedValueOnce(
        new ApiError({
          status,
          code: status === 401 ? "SESSION_INVALID" : "PERMISSION_DENIED",
          message: "Access denied.",
        }),
      );
      renderPage();
      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent(
          status === 401 ? "La sesión expiró" : "ya no tiene permisos",
        ),
      );
      expect(
        screen.queryByRole("region", {
          name: "Tabla de Actividad de Ventas",
        }),
      ).not.toBeInTheDocument();
    },
  );
});
