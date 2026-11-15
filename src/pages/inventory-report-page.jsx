import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowClockwise } from "@phosphor-icons/react/ArrowClockwise";
import { ChartBarHorizontal } from "@phosphor-icons/react/ChartBarHorizontal";
import { Package } from "@phosphor-icons/react/Package";
import { Button } from "../components/ui/button.jsx";
import { Input } from "../components/ui/input.jsx";
import { createCsv, downloadCsv } from "../lib/csv.js";
import { fetchAllReportRows } from "../lib/csv-export.js";
import DataTable from "../components/data-table.jsx";
import { useAuth } from "../auth/auth-context.jsx";
import { ApiError, reportApi } from "../lib/auth-api.js";
import {
  defaultInventoryActivityPeriod,
  inventoryOperationLabels,
  inventoryStatusLabels,
  validateInventoryActivityFilters,
} from "../lib/inventory-reports.js";
import {
  formatBogotaDateTime,
  formatExactQuantity,
} from "../lib/sales-activity.js";
import { formatExactSignedQuantity } from "../lib/purchase-receipts.js";

const queryRoot = "inventory-analytics-report";
const pageSize = 20;
const warehousePageSize = 20;
const commonPermissions = ["reports.read", "warehouses.read"];

function identityScope(session) {
  return JSON.stringify({
    id: session?.user?.id || "",
    role: session?.user?.role || "",
    permissions: [...(session?.permissions || [])].sort(),
  });
}

function allowedViews(session) {
  const permissions = new Set(session?.permissions || []);
  if (
    !["administrator", "auditor"].includes(session?.user?.role) ||
    commonPermissions.some((permission) => !permissions.has(permission))
  ) {
    return [];
  }
  return [
    ...(permissions.has("inventory.read") ? ["balances"] : []),
    ...(permissions.has("inventory.movements.read") ? ["movements"] : []),
  ];
}

function initialFilters(view) {
  return view === "movements"
    ? {
        ...defaultInventoryActivityPeriod(),
        warehouseId: "",
        unit: "",
        operationType: "",
        direction: "",
        page: 1,
      }
    : { warehouseId: "", unit: "", status: "", productStatus: "", page: 1 };
}

function stateFor(identity, view) {
  const filters = initialFilters(view);
  return { identity, view, draft: filters, applied: filters };
}

function quantity(
  value,
  { signed = false, unavailable = "No disponible" } = {},
) {
  if (value === null || value === undefined) return unavailable;
  const formatted = signed
    ? formatExactSignedQuantity(value)
    : formatExactQuantity(value);
  return formatted ?? unavailable;
}

function count(value) {
  return quantity(value, { unavailable: "No disponible" });
}

function positiveCount(value) {
  if (value === null || value === undefined || !/^\d+$/.test(String(value)))
    return false;
  try {
    return BigInt(value) > 0n;
  } catch {
    return false;
  }
}

async function deferUntilMounted(signal, request) {
  // StrictMode's development-only mount/cleanup cycle can otherwise start a
  // request that is cancelled immediately and repeated on the real mount.
  await Promise.resolve();
  if (signal.aborted)
    throw new DOMException("Solicitud cancelada", "AbortError");
  return request(signal);
}

function Metric({ label, value, note, emphasis = false }) {
  return (
    <article
      className={`inventory-report-metric${emphasis ? " inventory-report-metric--emphasis" : ""}`}
    >
      <h3>{label}</h3>
      <p className="inventory-report-metric__value">{value}</p>
      {note ? <p className="inventory-report-metric__note">{note}</p> : null}
    </article>
  );
}

function UnitBreakdown({ units, view }) {
  if (!units?.length) {
    return (
      <p className="inventory-report-muted">
        No hay cantidades verificables por unidad para estos filtros.
      </p>
    );
  }
  return (
    <div className="inventory-report-unit-list">
      {units.map((item) => (
        <div className="inventory-report-unit-row" key={item.unit}>
          <strong>{item.unit}</strong>
          {view === "balances" ? (
            <span>
              {positiveCount(item.verifiedPairs)
                ? quantity(item.quantity)
                : "Cantidad no verificable"}
              <small>
                {count(item.verifiedPairs)} de {count(item.candidatePairs)}{" "}
                combinaciones verificables
              </small>
            </span>
          ) : (
            <span>
              {count(item.verifiedMovements)} movimientos verificados
              <small>
                Entradas {quantity(item.entries)} · Salidas{" "}
                {quantity(item.exits)} · Diferencia{" "}
                {quantity(item.netChange, { signed: true })}
              </small>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function Coverage({ coverage, view }) {
  if (!coverage) return null;
  if (view === "balances") {
    return (
      <section
        className="inventory-report-coverage"
        aria-label="Cobertura de existencias"
      >
        <div>
          <strong>Cobertura de existencias</strong>
          <span>
            {count(coverage.verifiedPairs)} verificables de{" "}
            {count(coverage.candidatePairs)} combinaciones registradas
          </span>
        </div>
        {positiveCount(coverage.excludedPairs) ? (
          <p role="status">
            {count(coverage.excludedPairs)} combinaciones excluidas por falta de
            verificación suficiente. No aportan cantidades a los indicadores.
          </p>
        ) : (
          <p role="status">
            Todas las combinaciones registradas en este alcance pudieron
            verificarse.
          </p>
        )}
      </section>
    );
  }
  const effects = coverage.documentEffects;
  const transfers = coverage.transferIntegrity;
  return (
    <section
      className="inventory-report-coverage"
      aria-label="Cobertura de actividad"
    >
      <div>
        <strong>Cobertura de actividad</strong>
        <span>
          {count(coverage.verifiedMovements)} movimientos verificados de{" "}
          {count(coverage.candidateMovements)} candidatos
        </span>
      </div>
      <p role="status">
        {count(coverage.excludedMovements)} movimientos excluidos por
        verificación insuficiente.
        {effects
          ? ` Efectos documentales sin movimiento acreditado: ${count(effects.uncreditedEffects)} de ${count(effects.candidateEffects)}.`
          : ""}
        {transfers
          ? ` Traslados incompletos dentro del alcance: ${count(transfers.incompleteOperations)} de ${count(transfers.candidateOperations)}.`
          : ""}
      </p>
      {positiveCount(transfers?.incompleteOperations) ? (
        <p className="inventory-report-coverage__note">
          Los efectos de traslados incompletos no se presentan como movimientos
          verificados ni se reconstruyen desde este reporte.
        </p>
      ) : null}
    </section>
  );
}

function Pagination({ pagination, onPageChange, label }) {
  if (!pagination) return null;
  const page = Number(pagination.page) || 1;
  const size = Number(pagination.pageSize) || pageSize;
  const pagesReported = Number(pagination.totalPages) || 0;
  const maxReachable = Math.floor(10_000 / size) + 1;
  const pages = Math.max(1, Math.min(pagesReported, maxReachable));
  const total = count(String(pagination.total ?? "0"));
  return (
    <nav
      className="inventory-report-pagination"
      aria-label={`Paginación de ${label}`}
    >
      <span>
        {total} grupos · Página {page} de {pages}
      </span>
      <div>
        <Button
          variant="secondary"
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Anterior"
        >
          Anterior
        </Button>
        <Button
          variant="secondary"
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pages}
          aria-label="Siguiente"
        >
          Siguiente
        </Button>
      </div>
    </nav>
  );
}

function emptyMessage(view, result, filters) {
  if (result?.coverage?.scope === "no_assigned_warehouses") {
    return "No tienes bodegas asignadas para consultar este reporte.";
  }
  const summary = result?.summary;
  const candidates =
    view === "balances" ? summary?.candidatePairs : summary?.candidateMovements;
  const verified =
    view === "balances" ? summary?.verifiedPairs : summary?.verifiedMovements;
  const excluded =
    view === "balances" ? summary?.excludedPairs : summary?.excludedMovements;
  if (
    positiveCount(candidates) &&
    !positiveCount(verified) &&
    positiveCount(excluded)
  ) {
    return "Hay registros dentro de tu alcance, pero ninguno pudo acreditarse como verificable. No se presentan como cantidades correctas.";
  }
  const hasAppliedFilters = Object.entries(filters || {}).some(
    ([key, value]) =>
      !["page", "dateFrom", "dateTo"].includes(key) &&
      value !== "" &&
      value !== undefined,
  );
  if (hasAppliedFilters) return "No hay resultados para los filtros aplicados.";
  return view === "balances"
    ? "No hay saldos registrados dentro de tus bodegas autorizadas para estos filtros."
    : "No se registran movimientos físicos en tus bodegas autorizadas durante este período.";
}

export default function InventoryReportPage() {
  const { session, reloadSession } = useAuth();
  const queryClient = useQueryClient();
  const identity = identityScope(session);
  const views = allowedViews(session);
  const initialView = views.includes("balances") ? "balances" : views[0];
  const [filterState, setFilterState] = useState(() =>
    stateFor(identity, initialView),
  );
  const currentState =
    filterState.identity === identity
      ? filterState
      : stateFor(identity, initialView);
  const view = views.includes(currentState.view)
    ? currentState.view
    : initialView;
  const draft = currentState.draft;
  const applied = currentState.applied;
  const [warehouseSearchDraft, setWarehouseSearchDraft] = useState("");
  const [warehouseSearch, setWarehouseSearch] = useState("");
  const [warehousePage, setWarehousePage] = useState(1);
  const [selectedWarehouse, setSelectedWarehouse] = useState(null);
  const [validationError, setValidationError] = useState("");
  const [accessIssue, setAccessIssue] = useState("");
  const identityRef = useRef(identity);
  useLayoutEffect(() => {
    identityRef.current = identity;
  }, [identity]);
  const exportController = useRef(null);
  const [exportError, setExportError] = useState("");
  const [exporting, setExporting] = useState(false);
  const previousIdentity = useRef(identity);
  const permissionsKey = [...(session?.permissions || [])].sort().join(",");
  const permitted = views.includes(view);

  useEffect(() => {
    if (previousIdentity.current === identity) return;
    previousIdentity.current = identity;
    exportController.current?.abort();
    queryClient.removeQueries({ queryKey: [queryRoot] });
    setFilterState(stateFor(identity, initialView));
    setWarehouseSearchDraft("");
    setWarehouseSearch("");
    setWarehousePage(1);
    setSelectedWarehouse(null);
    setValidationError("");
    setAccessIssue("");
  }, [identity, initialView, queryClient]);

  const warehouseQuery = useQuery({
    queryKey: [
      queryRoot,
      "warehouses",
      identity,
      permissionsKey,
      view,
      warehouseSearch,
      warehousePage,
    ],
    queryFn: ({ signal }) =>
      deferUntilMounted(signal, (activeSignal) =>
        reportApi.inventoryWarehouses(
          {
            view,
            q: warehouseSearch,
            page: warehousePage,
            pageSize: warehousePageSize,
          },
          { signal: activeSignal },
        ),
      ),
    enabled: permitted && !accessIssue,
    retry: false,
  });

  const requestFilters =
    view === "balances"
      ? {
          ...(applied.warehouseId ? { warehouseId: applied.warehouseId } : {}),
          ...(applied.unit ? { unit: applied.unit } : {}),
          ...(applied.status ? { status: applied.status } : {}),
          ...(applied.productStatus
            ? { productStatus: applied.productStatus }
            : {}),
          page: applied.page,
          pageSize,
        }
      : {
          dateFrom: applied.dateFrom,
          dateTo: applied.dateTo,
          ...(applied.warehouseId ? { warehouseId: applied.warehouseId } : {}),
          ...(applied.unit ? { unit: applied.unit } : {}),
          ...(applied.operationType
            ? { operationType: applied.operationType }
            : {}),
          ...(applied.direction ? { direction: applied.direction } : {}),
          page: applied.page,
          pageSize,
        };

  const reportQuery = useQuery({
    queryKey: [queryRoot, view, identity, permissionsKey, requestFilters],
    queryFn: ({ signal }) =>
      deferUntilMounted(signal, (activeSignal) =>
        view === "balances"
          ? reportApi.inventoryBalances(requestFilters, {
              signal: activeSignal,
            })
          : reportApi.inventoryMovements(requestFilters, {
              signal: activeSignal,
            }),
      ),
    enabled: permitted && !accessIssue,
    retry: false,
  });

  const deniedError = [warehouseQuery.error, reportQuery.error].find(
    (error) => error instanceof ApiError && [401, 403].includes(error.status),
  );
  const staleWarehouseError =
    reportQuery.error instanceof ApiError &&
    reportQuery.error.status === 404 &&
    reportQuery.error.code === "WAREHOUSE_NOT_FOUND" &&
    Boolean(applied.warehouseId);
  const deniedMessage =
    accessIssue ||
    (deniedError
      ? deniedError.status === 401
        ? "La sesión expiró. Inicia sesión nuevamente para consultar este reporte."
        : "Tu sesión ya no tiene permisos para consultar esta vista de Inventario."
      : "");

  useEffect(() => {
    if (!deniedError) return;
    // The denied response is external state; suppress the active query immediately.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAccessIssue(
      deniedError.status === 401
        ? "La sesión expiró. Inicia sesión nuevamente para consultar este reporte."
        : "Tu sesión ya no tiene permisos para consultar esta vista de Inventario.",
    );
    queryClient.removeQueries({ queryKey: [queryRoot] });
    if (deniedError.status === 401) void reloadSession?.();
  }, [deniedError, queryClient, reloadSession]);

  useEffect(() => {
    if (!staleWarehouseError) return;
    queryClient.removeQueries({
      queryKey: [queryRoot, view, identity, permissionsKey],
    });
    // Rejected warehouse scope is an external authorization change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedWarehouse(null);
    setFilterState((previous) => {
      const base =
        previous.identity === identity ? previous : stateFor(identity, view);
      const draftFilters = { ...base.draft, warehouseId: "" };
      return {
        ...base,
        draft: draftFilters,
        applied: { ...base.applied, warehouseId: "", page: 1 },
      };
    });
    setValidationError("");
  }, [identity, permissionsKey, queryClient, staleWarehouseError, view]);

  const warehouses = warehouseQuery.data?.items || [];
  const selectedWarehouseOption =
    warehouses.find((item) => item.id === draft.warehouseId) ||
    (selectedWarehouse?.id === draft.warehouseId ? selectedWarehouse : null);
  const result = deniedMessage ? undefined : reportQuery.data;
  const totalPages = Number(result?.pagination?.totalPages) || 0;
  const columns =
    view === "balances"
      ? [
          {
            accessorKey: "warehouseName",
            header: "Bodega",
            cell: ({ row }) => (
              <span>
                {row.original.warehouseCode} · {row.original.warehouseName}
                {row.original.warehouseActive ? "" : " · Inactiva"}
              </span>
            ),
          },
          { accessorKey: "unit", header: "Unidad histórica" },
          {
            accessorKey: "quantity",
            header: "Cantidad verificada",
            cell: ({ row }) =>
              positiveCount(row.original.verifiedPairs)
                ? quantity(row.original.quantity)
                : "Saldo no verificable",
          },
          {
            accessorKey: "verifiedPairs",
            header: "Pares verificables",
            cell: ({ getValue }) => count(getValue()),
          },
          {
            accessorKey: "positivePairs",
            header: "Con existencias",
            cell: ({ getValue }) => count(getValue()),
          },
          {
            accessorKey: "depletedPairs",
            header: "Agotados",
            cell: ({ getValue }) => count(getValue()),
          },
          {
            accessorKey: "belowMinimumPairs",
            header: "Bajo mínimo",
            cell: ({ getValue }) => count(getValue()),
          },
          {
            accessorKey: "excludedPairs",
            header: "No verificables",
            cell: ({ row }) =>
              row.original.excludedPairs === "0"
                ? "0"
                : `${count(row.original.excludedPairs)} (${count(row.original.inconsistentPairs)} inconsistentes · ${count(row.original.insufficientPairs)} insuficientes)`,
          },
        ]
      : [
          {
            accessorKey: "warehouseName",
            header: "Bodega",
            cell: ({ row }) => (
              <span>
                {row.original.warehouseCode} · {row.original.warehouseName}
                {row.original.warehouseActive ? "" : " · Inactiva"}
              </span>
            ),
          },
          {
            accessorKey: "operationType",
            header: "Tipo de operación",
            cell: ({ getValue }) =>
              inventoryOperationLabels[getValue()] || "Operación de inventario",
          },
          { accessorKey: "unit", header: "Unidad histórica" },
          {
            accessorKey: "verifiedMovements",
            header: "Movimientos",
            cell: ({ getValue }) => count(getValue()),
          },
          {
            accessorKey: "entries",
            header: "Entradas",
            cell: ({ getValue }) => quantity(getValue()),
          },
          {
            accessorKey: "exits",
            header: "Salidas",
            cell: ({ getValue }) => quantity(getValue()),
          },
          {
            accessorKey: "netChange",
            header: "Diferencia física",
            cell: ({ getValue }) => quantity(getValue(), { signed: true }),
          },
        ];

  function updateDraft(key, value) {
    setFilterState((previous) => {
      const base =
        previous.identity === identity ? previous : stateFor(identity, view);
      return { ...base, draft: { ...base.draft, [key]: value } };
    });
    setValidationError("");
  }

  function changeView(event) {
    const nextView = event.target.value;
    if (!views.includes(nextView)) return;
    setFilterState(stateFor(identity, nextView));
    setWarehouseSearchDraft("");
    setWarehouseSearch("");
    setWarehousePage(1);
    setSelectedWarehouse(null);
    setValidationError("");
  }

  function applyFilters(event) {
    event.preventDefault();
    if (view === "movements" && !validateInventoryActivityFilters(draft)) {
      setValidationError(
        "Indica fechas reales en orden válido y un período máximo de 92 días calendario, contando ambos extremos.",
      );
      return;
    }
    setValidationError("");
    setFilterState((previous) => {
      const base =
        previous.identity === identity ? previous : stateFor(identity, view);
      return { ...base, applied: { ...base.draft, page: 1 } };
    });
  }

  function clearFilters() {
    const filters = initialFilters(view);
    setFilterState({ identity, view, draft: filters, applied: filters });
    setSelectedWarehouse(null);
    setValidationError("");
  }

  function changePage(nextPage) {
    if (
      nextPage < 1 ||
      nextPage > totalPages ||
      (nextPage - 1) * pageSize > 10_000
    )
      return;
    setFilterState((previous) => {
      const base =
        previous.identity === identity ? previous : stateFor(identity, view);
      const next = { ...base.applied, page: nextPage };
      return {
        ...base,
        applied: next,
        draft: { ...base.draft, page: nextPage },
      };
    });
  }

  function submitWarehouseSearch(event) {
    event.preventDefault();
    setWarehouseSearch(warehouseSearchDraft.trim());
    setWarehousePage(1);
  }

  function changeWarehouse(event) {
    const warehouseId = event.target.value;
    const selection =
      warehouses.find((warehouse) => warehouse.id === warehouseId) || null;
    setSelectedWarehouse(selection);
    updateDraft("warehouseId", warehouseId);
  }

  function refresh() {
    void reportQuery.refetch();
    void warehouseQuery.refetch();
  }

  async function exportCurrentPage() {
    exportController.current?.abort();
    const controller = new AbortController();
    exportController.current = controller;
    setExporting(true);
    setExportError("");
    try {
      const groupsToExport = await fetchAllReportRows({
        fetchPage: (filters, options) =>
          view === "balances"
            ? reportApi.inventoryBalances(filters, options)
            : reportApi.inventoryMovements(filters, options),
        filters: Object.fromEntries(
          Object.entries(requestFilters).filter(
            ([key]) => !["page", "pageSize"].includes(key),
          ),
        ),
        pageSize: 50,
        identity,
        getCurrentIdentity: () => identityRef.current,
        signal: controller.signal,
        rowsKey: "groups",
      });
      const columns =
        view === "balances"
          ? [
              { key: "warehouse", label: "Bodega" },
              { key: "unit", label: "Unidad histórica" },
              { key: "quantity", label: "Cantidad verificada", type: "number" },
              {
                key: "verifiedPairs",
                label: "Pares verificables",
                type: "number",
              },
              {
                key: "excludedPairs",
                label: "Pares no verificables",
                type: "number",
              },
            ]
          : [
              { key: "warehouse", label: "Bodega" },
              { key: "operationType", label: "Tipo de operación" },
              { key: "unit", label: "Unidad histórica" },
              {
                key: "verifiedMovements",
                label: "Movimientos verificables",
                type: "number",
              },
              { key: "entries", label: "Entradas", type: "number" },
              { key: "exits", label: "Salidas", type: "number" },
              { key: "netChange", label: "Diferencia física", type: "number" },
            ];
      const rows = groupsToExport.map((group) => ({
        warehouse: `${group.warehouseCode} · ${group.warehouseName}${group.warehouseActive ? "" : " · Inactiva"}`,
        unit: group.unit,
        quantity: positiveCount(group.verifiedPairs)
          ? group.quantity
          : "Saldo no verificable",
        verifiedPairs: group.verifiedPairs,
        excludedPairs: group.excludedPairs,
        operationType:
          inventoryOperationLabels[group.operationType] || group.operationType,
        verifiedMovements: group.verifiedMovements,
        entries: group.entries,
        exits: group.exits,
        netChange: group.netChange,
      }));
      const date = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      downloadCsv(
        `inventario-${view}-completo-${date}.csv`,
        createCsv(rows, columns),
      );
    } catch (error) {
      if (error.name !== "AbortError")
        setExportError(error.message || "No fue posible exportar el reporte.");
    } finally {
      if (exportController.current === controller)
        exportController.current = null;
      setExporting(false);
    }
  }

  if (!permitted) return null;

  const summary = result?.summary;
  const groups = result?.groups || [];
  const metrics =
    view === "balances"
      ? [
          {
            label: "Pares producto–bodega verificables",
            value: count(summary?.verifiedPairs),
            note: "No equivale a productos distintos.",
          },
          {
            label: "Con existencias",
            value: count(summary?.positivePairs),
            note: "Combinaciones con cantidad actual mayor que cero.",
          },
          {
            label: "Agotados",
            value: count(summary?.depletedPairs),
            note: "Combinaciones verificadas con cantidad cero.",
          },
          {
            label: "Bajo mínimo",
            value: count(summary?.belowMinimumPairs),
            note: "Puede coincidir con agotado.",
          },
        ]
      : [
          {
            label: "Movimientos físicos verificables",
            value: count(summary?.verifiedMovements),
            note: `${count(summary?.candidateMovements)} movimientos candidatos dentro del alcance.`,
          },
          {
            label: "Movimientos excluidos",
            value: count(summary?.excludedMovements),
            note: "No se incorporan a las cantidades verificadas.",
          },
        ];

  return (
    <section className="page-section sales-activity-page inventory-report-page">
      <header className="page-heading sales-activity-heading">
        <div>
          <p className="page-kicker">Reportes operativos</p>
          <h2>Resumen de Inventario y Actividad de Bodega</h2>
          <p>
            Consulta la distribución de existencias verificables y el resumen de
            movimientos físicos en tus bodegas autorizadas.
          </p>
        </div>
        <Button
          variant="secondary"
          type="button"
          onClick={refresh}
          disabled={
            reportQuery.isFetching ||
            warehouseQuery.isFetching ||
            Boolean(deniedMessage)
          }
        >
          <ArrowClockwise size={17} aria-hidden="true" /> Actualizar
        </Button>
      </header>

      <section
        className="inventory-report-toolbar"
        aria-label="Vista de Inventario"
      >
        <div className="inventory-report-view-control">
          <label htmlFor="inventory-report-view">Vista de Inventario</label>
          <select
            id="inventory-report-view"
            className="input-control"
            value={view}
            onChange={changeView}
          >
            {views.map((allowedView) => (
              <option key={allowedView} value={allowedView}>
                {allowedView === "balances"
                  ? "Existencias actuales"
                  : "Actividad del período"}
              </option>
            ))}
          </select>
        </div>
        <span className="inventory-report-time">
          {result?.generatedAt
            ? `Generado ${formatBogotaDateTime(result.generatedAt)}`
            : "Datos consultados al aplicar los filtros"}
        </span>
      </section>

      <form
        className="activity-filters inventory-report-filters"
        onSubmit={applyFilters}
        aria-label={`Filtros de ${view === "balances" ? "Existencias actuales" : "Actividad del período"}`}
      >
        <div className="activity-filter-fields">
          {view === "movements" ? (
            <>
              <div className="form-field">
                <label htmlFor="inventory-date-from">Desde</label>
                <Input
                  id="inventory-date-from"
                  type="date"
                  value={draft.dateFrom}
                  onChange={(event) =>
                    updateDraft("dateFrom", event.target.value)
                  }
                  aria-invalid={Boolean(validationError)}
                  aria-describedby={
                    validationError ? "inventory-filter-error" : undefined
                  }
                />
              </div>
              <div className="form-field">
                <label htmlFor="inventory-date-to">Hasta</label>
                <Input
                  id="inventory-date-to"
                  type="date"
                  value={draft.dateTo}
                  onChange={(event) =>
                    updateDraft("dateTo", event.target.value)
                  }
                  aria-invalid={Boolean(validationError)}
                  aria-describedby={
                    validationError ? "inventory-filter-error" : undefined
                  }
                />
              </div>
            </>
          ) : null}
          <div className="form-field activity-warehouse-field">
            <label htmlFor="inventory-warehouse">Bodega</label>
            <select
              id="inventory-warehouse"
              className="input-control"
              value={draft.warehouseId}
              onChange={changeWarehouse}
              disabled={
                warehouseQuery.isPending ||
                warehouseQuery.isError ||
                Boolean(deniedMessage)
              }
            >
              <option value="">Todas mis bodegas</option>
              {selectedWarehouseOption &&
              !warehouses.some(
                (warehouse) => warehouse.id === selectedWarehouseOption.id,
              ) ? (
                <option value={selectedWarehouseOption.id}>
                  {selectedWarehouseOption.name}
                  {selectedWarehouseOption.isActive ? "" : " · Inactiva"}
                </option>
              ) : null}
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                  {warehouse.isActive ? "" : " · Inactiva"}
                </option>
              ))}
            </select>
            {warehouseQuery.isPending ? (
              <small role="status">Cargando bodegas autorizadas…</small>
            ) : null}
            {warehouseQuery.isError && !deniedMessage ? (
              <small className="inventory-report-inline-error">
                No fue posible cargar las bodegas autorizadas.
              </small>
            ) : null}
          </div>
          <div className="form-field">
            <label htmlFor="inventory-unit">Unidad</label>
            <Input
              id="inventory-unit"
              value={draft.unit}
              onChange={(event) => updateDraft("unit", event.target.value)}
              maxLength={40}
              placeholder="Todas las unidades"
            />
          </div>
          {view === "balances" ? (
            <>
              <div className="form-field">
                <label htmlFor="inventory-status">Estado de existencias</label>
                <select
                  id="inventory-status"
                  className="input-control"
                  value={draft.status}
                  onChange={(event) =>
                    updateDraft("status", event.target.value)
                  }
                >
                  {Object.entries(inventoryStatusLabels).map(
                    ([value, label]) => (
                      <option key={value} value={value === "all" ? "" : value}>
                        {label}
                      </option>
                    ),
                  )}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="inventory-product-status">
                  Estado del producto
                </label>
                <select
                  id="inventory-product-status"
                  className="input-control"
                  value={draft.productStatus}
                  onChange={(event) =>
                    updateDraft("productStatus", event.target.value)
                  }
                >
                  <option value="">Todos</option>
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                </select>
              </div>
            </>
          ) : (
            <>
              <div className="form-field">
                <label htmlFor="inventory-operation">Tipo de operación</label>
                <select
                  id="inventory-operation"
                  className="input-control"
                  value={draft.operationType}
                  onChange={(event) =>
                    updateDraft("operationType", event.target.value)
                  }
                >
                  <option value="">Todos los tipos</option>
                  {Object.entries(inventoryOperationLabels).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ),
                  )}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="inventory-direction">Dirección</label>
                <select
                  id="inventory-direction"
                  className="input-control"
                  value={draft.direction}
                  onChange={(event) =>
                    updateDraft("direction", event.target.value)
                  }
                >
                  <option value="">Entradas y salidas</option>
                  <option value="IN">Entrada</option>
                  <option value="OUT">Salida</option>
                </select>
              </div>
            </>
          )}
        </div>
        <div className="activity-filter-actions">
          <Button type="submit" disabled={Boolean(deniedMessage)}>
            Consultar
          </Button>
          <Button
            variant="secondary"
            type="button"
            onClick={clearFilters}
            disabled={Boolean(deniedMessage)}
          >
            Limpiar filtros
          </Button>
          {validationError ? (
            <p
              id="inventory-filter-error"
              className="activity-validation activity-inline-error"
              role="alert"
            >
              {validationError}
            </p>
          ) : null}
        </div>
      </form>

      <form
        className="activity-warehouse-search inventory-report-warehouse-search"
        onSubmit={submitWarehouseSearch}
      >
        <label htmlFor="inventory-warehouse-search">
          Buscar en mis bodegas
        </label>
        <Input
          id="inventory-warehouse-search"
          value={warehouseSearchDraft}
          onChange={(event) => setWarehouseSearchDraft(event.target.value)}
          maxLength={100}
          placeholder="Código o nombre"
          disabled={Boolean(deniedMessage)}
        />
        <Button
          variant="secondary"
          type="submit"
          disabled={warehouseQuery.isFetching || Boolean(deniedMessage)}
        >
          Buscar
        </Button>
        <div className="activity-warehouse-pages">
          <span>
            {count(warehouseQuery.data?.pagination?.total ?? "0")} bodegas
          </span>
          <Button
            variant="secondary"
            type="button"
            onClick={() => setWarehousePage((page) => Math.max(1, page - 1))}
            disabled={
              warehousePage <= 1 ||
              warehouseQuery.isFetching ||
              Boolean(deniedMessage)
            }
            aria-label="Página anterior de bodegas"
          >
            Anterior
          </Button>
          <Button
            variant="secondary"
            type="button"
            onClick={() => setWarehousePage((page) => page + 1)}
            disabled={
              warehousePage >=
                (Number(warehouseQuery.data?.pagination?.totalPages) || 0) ||
              warehouseQuery.isFetching ||
              Boolean(deniedMessage)
            }
            aria-label="Página siguiente de bodegas"
          >
            Siguiente
          </Button>
        </div>
      </form>

      {deniedMessage ? (
        <div
          className="inventory-report-state inventory-report-state--error"
          role="alert"
        >
          {deniedMessage}
        </div>
      ) : null}
      {!deniedMessage && reportQuery.isPending ? (
        <div
          className="inventory-report-state"
          role="status"
          aria-live="polite"
        >
          <span className="table-skeleton" aria-hidden="true" />
          Consultando el resumen autorizado…
        </div>
      ) : null}
      {!deniedMessage && reportQuery.isError && !staleWarehouseError ? (
        <div
          className="inventory-report-state inventory-report-state--error"
          role="alert"
        >
          <span>
            {reportQuery.error?.message ||
              "No fue posible consultar este reporte."}
          </span>
          <Button
            variant="secondary"
            type="button"
            onClick={() => void reportQuery.refetch()}
          >
            Reintentar
          </Button>
        </div>
      ) : null}
      {!deniedMessage && staleWarehouseError ? (
        <div className="inventory-report-state" role="status">
          La bodega seleccionada ya no está autorizada. Se consultará de nuevo
          en todas tus bodegas asignadas.
        </div>
      ) : null}

      {result ? (
        <>
          <section
            className="inventory-report-banner"
            aria-label="Aclaración de la vista"
          >
            <span className="inventory-report-banner__icon" aria-hidden="true">
              {view === "balances" ? (
                <Package size={21} />
              ) : (
                <ChartBarHorizontal size={21} />
              )}
            </span>
            <div>
              <h3>
                {view === "balances"
                  ? "Existencias actuales verificables"
                  : "Actividad física del período"}
              </h3>
              <p>
                {view === "balances"
                  ? "Las existencias representan cantidades actuales verificables y no equivalen a un cierre histórico."
                  : "La actividad del período representa movimientos físicos registrados y verificables. Su diferencia no equivale al saldo actual de Inventario."}
              </p>
            </div>
            <span className="inventory-report-time">
              Generado {formatBogotaDateTime(result.generatedAt)}
            </span>
          </section>

          <section
            className={`inventory-report-metrics${view === "movements" ? " inventory-report-metrics--activity" : ""}`}
            aria-label="Indicadores del resumen"
          >
            {metrics.map((metric) => (
              <Metric key={metric.label} {...metric} />
            ))}
          </section>

          {view === "balances" ? (
            <p className="inventory-report-explanation">
              Los conteos corresponden a combinaciones producto–bodega, no
              necesariamente a productos distintos. Un agotado puede estar
              simultáneamente bajo mínimo. La ausencia de un saldo registrado no
              equivale a cero. Los saldos excluidos no aportan cantidades a los
              indicadores verificados.
            </p>
          ) : null}

          <section
            className="activity-quantities inventory-report-breakdown"
            aria-labelledby="inventory-report-units-heading"
          >
            <div className="activity-section-heading">
              <div>
                <h3 id="inventory-report-units-heading">
                  {view === "balances"
                    ? "Cantidades actuales por unidad histórica"
                    : "Movimientos por unidad histórica"}
                </h3>
                <p>
                  {view === "balances"
                    ? "Solo se suman cantidades de pares verificados; cada unidad se mantiene separada."
                    : "Entradas, salidas y diferencia se resumen en unidades independientes, para todo el período y no solo esta página."}
                </p>
              </div>
              <Button
                variant="secondary"
                type="button"
                onClick={exportCurrentPage}
                disabled={
                  groups.length === 0 || exporting || Boolean(deniedMessage)
                }
              >
                {exporting ? "Preparando CSV…" : "Exportar resultados (CSV)"}
              </Button>
            </div>
            {exportError ? (
              <p className="form-error" role="alert">
                {exportError}
              </p>
            ) : null}
            <UnitBreakdown units={summary?.units} view={view} />
          </section>

          <Coverage coverage={result.coverage} view={view} />

          {view === "movements" &&
          groups.some((group) => group.operationType === "transfer") ? (
            <p className="inventory-report-explanation">
              Los movimientos de traslado se muestran por bodega y no
              representan documentos comerciales independientes. Solo se
              incluyen efectos verificables dentro de tus bodegas autorizadas.
            </p>
          ) : null}

          {!positiveCount(
            view === "balances"
              ? summary?.candidatePairs
              : summary?.candidateMovements,
          ) ? (
            <div
              className="inventory-report-state inventory-report-state--empty"
              role="status"
            >
              {emptyMessage(view, result, applied)}
            </div>
          ) : !positiveCount(
              view === "balances"
                ? summary?.verifiedPairs
                : summary?.verifiedMovements,
            ) ? (
            <div
              className="inventory-report-state inventory-report-state--empty"
              role="status"
            >
              {emptyMessage(view, result, applied)}
            </div>
          ) : null}

          <section
            className="activity-table-panel inventory-report-table-panel"
            aria-label="Detalle agrupado"
          >
            <div className="activity-section-heading">
              <div>
                <h3>
                  {view === "balances"
                    ? "Existencias por bodega y unidad"
                    : "Actividad física por bodega, tipo y unidad"}
                </h3>
                <p>
                  {view === "balances"
                    ? "Una fila por bodega y unidad histórica. No es un listado de productos."
                    : "Una fila por bodega, tipo de operación y unidad histórica."}
                </p>
              </div>
            </div>
            <DataTable
              columns={columns}
              data={groups}
              page={Number(result.pagination.page) || 1}
              pageSize={pageSize}
              total={Number(result.pagination.total) || 0}
              loading={false}
              regionLabel={
                view === "balances"
                  ? "Existencias por bodega y unidad"
                  : "Actividad física por bodega, tipo y unidad"
              }
              emptyLabel={
                groups.length === 0
                  ? "Sin grupos verificables en esta página."
                  : "Los registros del alcance no contienen filas verificables para esta tabla."
              }
            />
            <Pagination
              pagination={result.pagination}
              onPageChange={changePage}
              label={
                view === "balances"
                  ? "existencias agrupadas"
                  : "actividad agrupada"
              }
            />
          </section>
        </>
      ) : null}
    </section>
  );
}
