import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import InventoryReportPage from "./inventory-report-page.jsx";
import { useAuth } from "../auth/auth-context.jsx";
import { ApiError, reportApi } from "../lib/auth-api.js";

vi.mock("../auth/auth-context.jsx", () => ({ useAuth: vi.fn() }));
vi.mock("../lib/auth-api.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    reportApi: {
      inventoryBalances: vi.fn(),
      inventoryMovements: vi.fn(),
      inventoryWarehouses: vi.fn(),
    },
  };
});

const balances = {
  view: "balances",
  summary: {
    candidatePairs: "5",
    verifiedPairs: "4",
    excludedPairs: "1",
    inconsistentPairs: "1",
    insufficientPairs: "0",
    positivePairs: "3",
    depletedPairs: "1",
    belowMinimumPairs: "2",
    units: [
      {
        unit: "unidad",
        candidatePairs: "4",
        verifiedPairs: "3",
        quantity: "9007199254740993",
        excludedPairs: "1",
        inconsistentPairs: "1",
        insufficientPairs: "0",
      },
      {
        unit: "caja",
        candidatePairs: "1",
        verifiedPairs: "1",
        quantity: "0",
        excludedPairs: "0",
        inconsistentPairs: "0",
        insufficientPairs: "0",
      },
    ],
  },
  groups: [
    {
      warehouseId: "4",
      warehouseCode: "BOD-4",
      warehouseName: "Bodega Norte",
      warehouseActive: false,
      unit: "unidad",
      quantity: "9007199254740993",
      candidatePairs: "4",
      verifiedPairs: "3",
      excludedPairs: "1",
      inconsistentPairs: "1",
      insufficientPairs: "0",
      positivePairs: "2",
      depletedPairs: "1",
      belowMinimumPairs: "2",
    },
    {
      warehouseId: "4",
      warehouseCode: "BOD-4",
      warehouseName: "Bodega Norte",
      warehouseActive: false,
      unit: "caja",
      quantity: "0",
      candidatePairs: "1",
      verifiedPairs: "1",
      excludedPairs: "0",
      inconsistentPairs: "0",
      insufficientPairs: "0",
      positivePairs: "0",
      depletedPairs: "1",
      belowMinimumPairs: "0",
    },
  ],
  pagination: { page: 1, pageSize: 20, total: "2", totalPages: "1" },
  coverage: {
    candidatePairs: "5",
    verifiedPairs: "4",
    excludedPairs: "1",
    completeWithinCandidates: false,
  },
  generatedAt: "2026-01-30T15:00:00.000Z",
};

const movements = {
  view: "movements",
  summary: {
    candidateMovements: "5",
    verifiedMovements: "4",
    excludedMovements: "1",
    inconsistentMovements: "1",
    insufficientMovements: "0",
    documentEffects: { candidateEffects: "7", uncreditedEffects: "1" },
    transferIntegrity: { candidateOperations: "2", incompleteOperations: "1" },
    units: [
      {
        unit: "unidad",
        verifiedMovements: "3",
        entries: "10",
        exits: "4",
        netChange: "6",
      },
      {
        unit: "caja",
        verifiedMovements: "1",
        entries: "0",
        exits: "0",
        netChange: "0",
      },
    ],
  },
  groups: [
    {
      warehouseId: "4",
      warehouseCode: "BOD-4",
      warehouseName: "Bodega Norte",
      warehouseActive: true,
      operationType: "transfer",
      unit: "unidad",
      verifiedMovements: "2",
      entries: "10",
      exits: "0",
      netChange: "10",
    },
  ],
  pagination: { page: 1, pageSize: 20, total: "1", totalPages: "1" },
  coverage: {
    candidateMovements: "5",
    verifiedMovements: "4",
    excludedMovements: "1",
    completeWithinCandidates: false,
    documentEffects: {
      candidateEffects: "7",
      uncreditedEffects: "1",
      completeWithinCandidates: false,
    },
    transferIntegrity: {
      candidateOperations: "2",
      incompleteOperations: "1",
      completeWithinCandidates: false,
    },
  },
  criteria: {
    dateFrom: "2026-01-01",
    dateTo: "2026-01-30",
    timeZone: "America/Bogota",
    periodSemantics:
      "Actividad física registrada durante el período; no representa un saldo de cierre.",
  },
  generatedAt: "2026-01-30T15:00:00.000Z",
};

let originalCreateObjectUrl;
let originalRevokeObjectUrl;

function renderPage(
  permissions = [
    "reports.read",
    "warehouses.read",
    "inventory.read",
    "inventory.movements.read",
  ],
  role = "administrator",
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  useAuth.mockReturnValue({
    session: { user: { id: "7", role }, permissions },
  });
  reportApi.inventoryBalances.mockResolvedValue(balances);
  reportApi.inventoryMovements.mockResolvedValue(movements);
  reportApi.inventoryWarehouses.mockResolvedValue({
    view: "balances",
    items: [{ id: "4", code: "BOD-4", name: "Bodega Norte", isActive: false }],
    pagination: { page: 1, pageSize: 20, total: "1", totalPages: "1" },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <InventoryReportPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-01-01T03:00:00.000Z"));
});
afterEach(() => {
  cleanup();
  if (originalCreateObjectUrl) {
    Object.defineProperty(URL, "createObjectURL", originalCreateObjectUrl);
    originalCreateObjectUrl = undefined;
  } else {
    delete URL.createObjectURL;
  }
  if (originalRevokeObjectUrl) {
    Object.defineProperty(URL, "revokeObjectURL", originalRevokeObjectUrl);
    originalRevokeObjectUrl = undefined;
  } else {
    delete URL.revokeObjectURL;
  }
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("Inventory report page", () => {
  it("exports only the current authorized page to CSV", async () => {
    originalCreateObjectUrl = Object.getOwnPropertyDescriptor(
      URL,
      "createObjectURL",
    );
    originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(
      URL,
      "revokeObjectURL",
    );
    const createObjectUrl = vi.fn(() => "blob:inventory-report");
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl,
    });
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    renderPage();
    await screen.findAllByText("9.007.199.254.740.993");
    fireEvent.click(
      screen.getByRole("button", { name: "Exportar resultados (CSV)" }),
    );

    await waitFor(() => expect(createObjectUrl).toHaveBeenCalledTimes(1));
    const [blob] = createObjectUrl.mock.calls[0];
    expect(blob.type).toBe("text/csv;charset=utf-8");
    const csv = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsText(blob);
    });
    expect(csv).toContain("BOD-4 · Bodega Norte · Inactiva");
    expect(csv).toContain("9007199254740993");
    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:inventory-report");
    anchorClick.mockRestore();
  });

  it("shows only current authorized view, exact per-unit quantities and coverage without presenting excluded balances as zero", async () => {
    renderPage(["reports.read", "warehouses.read", "inventory.read"]);
    expect(
      await screen.findByRole("heading", {
        name: "Resumen de Inventario y Actividad de Bodega",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Vista de Inventario" }),
    ).toHaveValue("balances");
    expect(
      screen.queryByRole("option", { name: "Actividad del período" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("9.007.199.254.740.993").length).toBeGreaterThan(
      0,
    );
    expect(
      screen.getByText(
        /combinaciones excluidas por falta de verificación suficiente/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Las existencias representan cantidades actuales verificables y no equivalen a un cierre histórico.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/combinaciones producto–bodega/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/agotado puede estar simultáneamente bajo mínimo/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Existencias por bodega y unidad" }),
    ).toBeInTheDocument();
    expect(reportApi.inventoryMovements).not.toHaveBeenCalled();
    expect(reportApi.inventoryWarehouses).toHaveBeenCalledWith(
      expect.objectContaining({ view: "balances" }),
      expect.anything(),
    );
  });

  it("shows recorded zero separately from absence of a registered balance", async () => {
    reportApi.inventoryBalances.mockResolvedValueOnce({
      ...balances,
      summary: {
        ...balances.summary,
        candidatePairs: "0",
        verifiedPairs: "0",
        excludedPairs: "0",
        positivePairs: "0",
        depletedPairs: "0",
        belowMinimumPairs: "0",
        units: [],
      },
      groups: [],
      coverage: { candidatePairs: "0", verifiedPairs: "0", excludedPairs: "0" },
    });
    renderPage(["reports.read", "warehouses.read", "inventory.read"]);
    expect(
      (
        await screen.findAllByText(
          "No hay saldos registrados dentro de tus bodegas autorizadas para estos filtros.",
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText("0", { selector: ".inventory-report-metric__value" })
        .length,
    ).toBeGreaterThan(0);
  });

  it("loads activity only when selected, uses Bogota dates, preserves units, and summarizes beyond the page", async () => {
    renderPage();
    expect(
      await screen.findByRole("heading", {
        name: "Resumen de Inventario y Actividad de Bodega",
      }),
    ).toBeInTheDocument();
    fireEvent.change(
      screen.getByRole("combobox", { name: "Vista de Inventario" }),
      {
        target: { value: "movements" },
      },
    );
    await screen.findByLabelText("Desde");
    expect(screen.getByLabelText("Desde")).toHaveValue("2025-12-02");
    expect(screen.getByLabelText("Hasta")).toHaveValue("2025-12-31");
    expect((await screen.findAllByText("10")).length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "La actividad del período representa movimientos físicos registrados y verificables. Su diferencia no equivale al saldo actual de Inventario.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Efectos documentales sin movimiento acreditado: 1/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Traslados incompletos dentro del alcance: 1/),
    ).toBeInTheDocument();
    expect(reportApi.inventoryMovements).toHaveBeenCalledWith(
      expect.objectContaining({
        dateFrom: "2025-12-02",
        dateTo: "2025-12-31",
        page: 1,
        pageSize: 20,
      }),
      expect.anything(),
    );
    expect(reportApi.inventoryWarehouses).toHaveBeenCalledWith(
      expect.objectContaining({ view: "movements" }),
      expect.anything(),
    );
    expect(
      screen.getByRole("region", {
        name: "Actividad física por bodega, tipo y unidad",
      }),
    ).toBeInTheDocument();
  });

  it("does not offer or request a view for which the session lacks its independent permission", async () => {
    renderPage(["reports.read", "warehouses.read", "inventory.movements.read"]);
    expect(
      await screen.findByRole("heading", {
        name: "Resumen de Inventario y Actividad de Bodega",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Vista de Inventario" }),
    ).toHaveValue("movements");
    expect(
      screen.queryByRole("option", { name: "Existencias actuales" }),
    ).not.toBeInTheDocument();
    expect(reportApi.inventoryBalances).not.toHaveBeenCalled();
    expect(reportApi.inventoryMovements).toHaveBeenCalledTimes(1);
  });

  it("hides cached report content immediately when the API denies access", async () => {
    reportApi.inventoryBalances.mockRejectedValueOnce(
      new ApiError({
        status: 403,
        code: "PERMISSION_DENIED",
        message: "denied",
      }),
    );
    renderPage(["reports.read", "warehouses.read", "inventory.read"]);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tu sesión ya no tiene permisos",
    );
    expect(
      screen.queryByRole("region", { name: "Existencias por bodega y unidad" }),
    ).not.toBeInTheDocument();
  });

  it("rejects invalid activity dates locally and resets the page after applying changed filters", async () => {
    renderPage();
    expect(
      await screen.findByRole("heading", {
        name: "Resumen de Inventario y Actividad de Bodega",
      }),
    ).toBeInTheDocument();
    fireEvent.change(
      screen.getByRole("combobox", { name: "Vista de Inventario" }),
      {
        target: { value: "movements" },
      },
    );
    await waitFor(() =>
      expect(reportApi.inventoryMovements).toHaveBeenCalledTimes(1),
    );
    const before = reportApi.inventoryMovements.mock.calls.length;
    fireEvent.change(screen.getByLabelText("Desde"), {
      target: { value: "2026-02-30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
    expect(screen.getByRole("alert")).toHaveTextContent("fechas reales");
    expect(reportApi.inventoryMovements).toHaveBeenCalledTimes(before);
  });

  it("clears a warehouse filter that the backend no longer authorizes", async () => {
    reportApi.inventoryBalances
      .mockResolvedValueOnce(balances)
      .mockRejectedValueOnce(
        new ApiError({
          status: 404,
          code: "WAREHOUSE_NOT_FOUND",
          message: "No se encontró la bodega autorizada.",
        }),
      )
      .mockResolvedValue(balances);
    renderPage(["reports.read", "warehouses.read", "inventory.read"]);
    await screen.findByRole("heading", {
      name: "Existencias actuales verificables",
    });
    fireEvent.change(screen.getByLabelText("Bodega"), {
      target: { value: "4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
    await waitFor(() =>
      expect(reportApi.inventoryBalances).toHaveBeenCalledWith(
        expect.objectContaining({ warehouseId: "4" }),
        expect.anything(),
      ),
    );
    await waitFor(() =>
      expect(reportApi.inventoryBalances).toHaveBeenLastCalledWith(
        expect.not.objectContaining({ warehouseId: "4" }),
        expect.anything(),
      ),
    );
    expect(screen.getByLabelText("Bodega")).toHaveValue("");
  });

  it("uses server paging and resets the page when a filter is applied", async () => {
    reportApi.inventoryBalances
      .mockResolvedValueOnce({
        ...balances,
        pagination: { page: 1, pageSize: 20, total: "45", totalPages: "3" },
      })
      .mockResolvedValueOnce({
        ...balances,
        pagination: { page: 2, pageSize: 20, total: "45", totalPages: "3" },
      })
      .mockResolvedValue(balances);
    renderPage(["reports.read", "warehouses.read", "inventory.read"]);
    await screen.findByRole("heading", {
      name: "Existencias actuales verificables",
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Siguiente", exact: true }),
    );
    await waitFor(() =>
      expect(reportApi.inventoryBalances).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2, pageSize: 20 }),
        expect.anything(),
      ),
    );
    expect(screen.getByText(/Página 2 de 3/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Estado de existencias"), {
      target: { value: "positive" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
    await waitFor(() =>
      expect(reportApi.inventoryBalances).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, status: "positive" }),
        expect.anything(),
      ),
    );
  });
});
