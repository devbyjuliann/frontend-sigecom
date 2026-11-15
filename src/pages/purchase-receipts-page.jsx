import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowClockwise } from "@phosphor-icons/react/ArrowClockwise";
import { Receipt } from "@phosphor-icons/react/Receipt";
import { Button } from "../components/ui/button.jsx";
import { Input } from "../components/ui/input.jsx";
import { createCsv, downloadCsv } from "../lib/csv.js";
import { fetchAllReportRows } from "../lib/csv-export.js";
import DataTable from "../components/data-table.jsx";
import { useAuth } from "../auth/auth-context.jsx";
import { ApiError, reportApi } from "../lib/auth-api.js";
import {
  defaultPurchaseReceiptsPeriod,
  formatExactSignedQuantity,
  validatePurchaseReceiptsFilters,
} from "../lib/purchase-receipts.js";
import { formatBogotaDateTime, formatExactCop } from "../lib/sales-activity.js";

const pageSize = 20;
const warehousePageSize = 20;
const labels = {
  purchase_receipt: "Recepción de mercancía",
  supplier_return: "Devolución a proveedor",
};

function identityScope(session) {
  return JSON.stringify({
    id: session?.user?.id || "",
    role: session?.user?.role || "",
    permissions: [...(session?.permissions || [])].sort(),
  });
}

function quantity(value) {
  return formatExactSignedQuantity(value) ?? "Cantidad no disponible";
}

function Metric({ title, value, detail, variant = "" }) {
  return (
    <article className={`activity-metric${variant ? ` ${variant}` : ""}`}>
      <h2>{title}</h2>
      <p className="activity-metric__value">{formatExactCop(value)}</p>
      <p className="activity-metric__detail">{detail}</p>
    </article>
  );
}

export default function PurchaseReceiptsPage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const identity = identityScope(session);
  const previousIdentity = useRef(identity);
  const identityRef = useRef(identity);
  useLayoutEffect(() => {
    identityRef.current = identity;
  }, [identity]);
  const exportController = useRef(null);
  const [exportError, setExportError] = useState("");
  const [exporting, setExporting] = useState(false);
  const initialPeriod = useMemo(() => defaultPurchaseReceiptsPeriod(), []);
  const [draft, setDraft] = useState(() => ({
    ...initialPeriod,
    warehouseId: "",
  }));
  const [applied, setApplied] = useState(() => ({
    ...initialPeriod,
    warehouseId: "",
    page: 1,
  }));
  const [selectedWarehouse, setSelectedWarehouse] = useState(null);
  const [validationError, setValidationError] = useState("");
  const [warehouseSearchDraft, setWarehouseSearchDraft] = useState("");
  const [warehouseSearch, setWarehouseSearch] = useState("");
  const [warehousePage, setWarehousePage] = useState(1);
  const [accessIssue, setAccessIssue] = useState("");

  useEffect(() => {
    if (previousIdentity.current === identity) return;
    previousIdentity.current = identity;
    exportController.current?.abort();
    queryClient.removeQueries({ queryKey: ["purchase-receipts"] });
    setAccessIssue("");
    setSelectedWarehouse(null);
    setDraft({ ...defaultPurchaseReceiptsPeriod(), warehouseId: "" });
    setApplied({
      ...defaultPurchaseReceiptsPeriod(),
      warehouseId: "",
      page: 1,
    });
    setWarehouseSearchDraft("");
    setWarehouseSearch("");
    setWarehousePage(1);
  }, [identity, queryClient]);

  const warehouseQuery = useQuery({
    queryKey: [
      "purchase-receipts",
      "warehouses",
      identity,
      warehouseSearch,
      warehousePage,
    ],
    queryFn: ({ signal }) =>
      reportApi.purchaseReceiptWarehouses(
        {
          q: warehouseSearch,
          page: warehousePage,
          pageSize: warehousePageSize,
        },
        { signal },
      ),
    retry: false,
    enabled: !accessIssue,
  });

  const requestFilters = useMemo(
    () => ({
      dateFrom: applied.dateFrom,
      dateTo: applied.dateTo,
      ...(applied.warehouseId ? { warehouseId: applied.warehouseId } : {}),
      page: applied.page,
      pageSize,
    }),
    [applied],
  );

  const activityQuery = useQuery({
    queryKey: ["purchase-receipts", "activities", identity, requestFilters],
    queryFn: ({ signal }) =>
      reportApi.purchaseReceipts(requestFilters, { signal }),
    retry: false,
    enabled: !accessIssue,
  });

  useEffect(() => {
    const denied = [warehouseQuery.error, activityQuery.error].find(
      (error) => error instanceof ApiError && [401, 403].includes(error.status),
    );
    if (!denied) return;
    // Keep a denial latch after removing the cached result so it cannot refetch or reveal stale data.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAccessIssue(
      denied.status === 401
        ? "La sesión expiró. Inicia sesión nuevamente para consultar este reporte."
        : "Tu sesión ya no tiene permisos para consultar Recepciones y Devoluciones de Compras.",
    );
    queryClient.removeQueries({ queryKey: ["purchase-receipts"] });
  }, [activityQuery.error, queryClient, warehouseQuery.error]);

  const warehouses = warehouseQuery.data?.items || [];
  const currentSelectedWarehouse =
    warehouses.find(({ id }) => id === draft.warehouseId) ||
    (selectedWarehouse?.id === draft.warehouseId ? selectedWarehouse : null);
  const result = activityQuery.data;
  const columns = useMemo(
    () => [
      {
        id: "occurredAt",
        header: "Fecha",
        accessorFn: (activity) => activity.occurredAt,
        cell: ({ getValue }) => formatBogotaDateTime(getValue()),
      },
      {
        id: "type",
        header: "Tipo de actividad",
        accessorFn: (activity) =>
          labels[activity.type] || "Actividad de compras",
      },
      {
        id: "order",
        header: "Orden relacionada",
        accessorFn: (activity) => activity.purchaseOrderId,
        cell: ({ getValue }) => `Orden #${getValue()}`,
      },
      {
        id: "document",
        header: "Recepción o devolución",
        cell: ({ row }) =>
          row.original.type === "supplier_return"
            ? `Devolución #${row.original.supplierReturnId}`
            : `Recepción #${row.original.purchaseReceiptId}`,
      },
      {
        id: "warehouse",
        header: "Bodega",
        accessorFn: (activity) =>
          `${activity.warehouse.code} · ${activity.warehouse.name}`,
      },
      {
        id: "amount",
        header: "Importe",
        accessorFn: (activity) => activity.amount,
        cell: ({ getValue }) =>
          getValue() === null ? "—" : formatExactCop(getValue()),
      },
      {
        id: "quantities",
        header: "Cantidades",
        cell: ({ row }) =>
          row.original.quantitiesByUnit?.length ? (
            <ul className="activity-quantity-list">
              {row.original.quantitiesByUnit.map((item) => (
                <li key={`${row.original.id}-${item.unit}`}>
                  {item.unit}:{" "}
                  {row.original.type === "supplier_return"
                    ? "devueltas"
                    : "recibidas"}{" "}
                  {quantity(item.quantityReturned ?? item.quantityReceived)}
                </li>
              ))}
            </ul>
          ) : (
            "—"
          ),
      },
    ],
    [],
  );

  function updateDraft(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
    setValidationError("");
  }

  function applyFilters(event) {
    event.preventDefault();
    if (!validatePurchaseReceiptsFilters(draft)) {
      setValidationError(
        "Indica fechas reales en orden válido y un período máximo de 92 días calendario, contando ambos extremos.",
      );
      return;
    }
    setValidationError("");
    setApplied({ ...draft, page: 1 });
  }

  function clearFilters() {
    const period = defaultPurchaseReceiptsPeriod();
    const next = { ...period, warehouseId: "" };
    setDraft(next);
    setApplied({ ...next, page: 1 });
    setSelectedWarehouse(null);
    setValidationError("");
  }

  function selectWarehouse(event) {
    const warehouseId = event.target.value;
    setSelectedWarehouse(
      warehouses.find(({ id }) => id === warehouseId) || null,
    );
    updateDraft("warehouseId", warehouseId);
  }

  function changePage(nextPage) {
    const totalPages = result?.pagination?.totalPages || 0;
    if (
      nextPage < 1 ||
      nextPage > totalPages ||
      (nextPage - 1) * pageSize > 10000
    )
      return;
    setApplied((current) => ({ ...current, page: nextPage }));
  }

  function searchWarehouses(event) {
    event.preventDefault();
    setWarehouseSearch(warehouseSearchDraft.trim());
    setWarehousePage(1);
  }

  async function exportCurrentPage() {
    exportController.current?.abort();
    const controller = new AbortController();
    exportController.current = controller;
    setExporting(true);
    setExportError("");
    try {
      const activities = await fetchAllReportRows({
        fetchPage: reportApi.purchaseReceipts,
        filters: {
          dateFrom: applied.dateFrom,
          dateTo: applied.dateTo,
          ...(applied.warehouseId ? { warehouseId: applied.warehouseId } : {}),
        },
        pageSize: 100,
        identity,
        getCurrentIdentity: () => identityRef.current,
        signal: controller.signal,
        rowsKey: "activities",
      });
      const columns = [
        { key: "occurredAt", label: "Fecha" },
        { key: "activity", label: "Tipo de actividad" },
        { key: "order", label: "Orden relacionada", type: "number" },
        { key: "document", label: "Recepción o devolución" },
        { key: "warehouse", label: "Bodega" },
        { key: "amount", label: "Importe COP", type: "number" },
        { key: "quantities", label: "Cantidades" },
      ];
      const rows = activities.map((activity) => ({
        occurredAt: formatBogotaDateTime(activity.occurredAt),
        activity: labels[activity.type] || "Actividad de compras",
        order: activity.purchaseOrderId,
        document:
          activity.type === "supplier_return"
            ? `Devolución #${activity.supplierReturnId}`
            : `Recepción #${activity.purchaseReceiptId}`,
        warehouse: `${activity.warehouse.code} · ${activity.warehouse.name}`,
        amount: activity.amount,
        quantities: (activity.quantitiesByUnit || [])
          .map((item) => {
            const value = item.quantityReturned ?? item.quantityReceived;
            return `${item.unit}: ${activity.type === "supplier_return" ? "devueltas" : "recibidas"} ${value}`;
          })
          .join("; "),
      }));
      const date = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      downloadCsv(
        `actividad-compras-completa-${date}.csv`,
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

  const accessError = activityQuery.error || warehouseQuery.error;
  const serverOffsetError =
    accessError instanceof ApiError &&
    accessError.code === "PAGE_OFFSET_TOO_LARGE";

  return (
    <section className="page-section sales-activity-page purchase-receipts-report">
      <header className="page-heading sales-activity-heading">
        <div>
          <p className="page-kicker">Reportes operativos</p>
          <h2>Recepciones y Devoluciones de Compras</h2>
          <p>
            Consulta la mercancía recibida de proveedores y las devoluciones
            realizadas durante un período, según los documentos e inventarios
            verificables.
          </p>
        </div>
        <Button
          variant="secondary"
          type="button"
          onClick={() => {
            void activityQuery.refetch();
            void warehouseQuery.refetch();
          }}
          disabled={
            activityQuery.isFetching ||
            warehouseQuery.isFetching ||
            Boolean(accessIssue)
          }
        >
          <ArrowClockwise size={17} aria-hidden="true" /> Actualizar
        </Button>
      </header>

      <section
        className="activity-report-banner"
        aria-label="Reporte disponible"
      >
        <span className="activity-report-banner__icon" aria-hidden="true">
          <Receipt size={21} />
        </span>
        <div>
          <h3>Recepciones y Devoluciones de Compras</h3>
          <p>
            El resumen corresponde a todo el período, no solo a la página
            visible.
          </p>
        </div>
        {result ? (
          <span className="activity-report-time">
            Actualizado {formatBogotaDateTime(result.generatedAt)}
          </span>
        ) : null}
      </section>

      <form
        className="activity-filters"
        onSubmit={applyFilters}
        aria-label="Filtros de Compras"
      >
        <div className="activity-filter-fields">
          <div className="form-field">
            <label htmlFor="purchase-report-date-from">Desde</label>
            <Input
              id="purchase-report-date-from"
              type="date"
              value={draft.dateFrom}
              onChange={(event) => updateDraft("dateFrom", event.target.value)}
              aria-invalid={Boolean(validationError)}
              aria-describedby={
                validationError ? "purchase-report-filter-error" : undefined
              }
            />
          </div>
          <div className="form-field">
            <label htmlFor="purchase-report-date-to">Hasta</label>
            <Input
              id="purchase-report-date-to"
              type="date"
              value={draft.dateTo}
              onChange={(event) => updateDraft("dateTo", event.target.value)}
              aria-invalid={Boolean(validationError)}
              aria-describedby={
                validationError ? "purchase-report-filter-error" : undefined
              }
            />
          </div>
          <div className="form-field activity-warehouse-field">
            <label htmlFor="purchase-report-warehouse">Bodega</label>
            <select
              id="purchase-report-warehouse"
              className="input-control"
              value={draft.warehouseId}
              onChange={selectWarehouse}
              disabled={
                warehouseQuery.isPending ||
                warehouseQuery.isError ||
                Boolean(accessIssue)
              }
            >
              <option value="">Todas mis bodegas</option>
              {currentSelectedWarehouse &&
              !warehouses.some(
                ({ id }) => id === currentSelectedWarehouse.id,
              ) ? (
                <option value={currentSelectedWarehouse.id}>
                  {currentSelectedWarehouse.name}
                  {currentSelectedWarehouse.isActive ? "" : " · Inactiva"}
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
              <small role="status">Cargando tus bodegas…</small>
            ) : null}
            {warehouseQuery.isError && !accessIssue ? (
              <small className="activity-inline-error" role="alert">
                No se pudieron cargar las bodegas autorizadas.
              </small>
            ) : null}
          </div>
        </div>
        <div className="activity-filter-actions">
          <Button type="submit">Consultar</Button>
          <Button variant="secondary" type="button" onClick={clearFilters}>
            Limpiar filtros
          </Button>
        </div>
        {validationError ? (
          <p
            className="inline-alert activity-validation"
            id="purchase-report-filter-error"
            role="alert"
          >
            {validationError}
          </p>
        ) : null}
      </form>

      <form
        className="activity-warehouse-search"
        onSubmit={searchWarehouses}
        aria-label="Buscar bodegas asignadas para Compras"
      >
        <label htmlFor="purchase-report-warehouse-search">
          Buscar en mis bodegas
        </label>
        <Input
          id="purchase-report-warehouse-search"
          type="search"
          maxLength={100}
          value={warehouseSearchDraft}
          onChange={(event) => setWarehouseSearchDraft(event.target.value)}
          placeholder="Código o nombre de bodega"
        />
        <Button
          variant="secondary"
          type="submit"
          disabled={warehouseQuery.isFetching}
        >
          Buscar
        </Button>
        <div
          className="activity-warehouse-pages"
          aria-label="Páginas de bodegas"
        >
          <Button
            variant="ghost"
            type="button"
            onClick={() => setWarehousePage((page) => Math.max(1, page - 1))}
            disabled={warehousePage <= 1 || warehouseQuery.isFetching}
          >
            Anterior
          </Button>
          <span>
            Página {warehouseQuery.data?.pagination.page || warehousePage} de{" "}
            {Math.max(warehouseQuery.data?.pagination.totalPages || 0, 1)}
          </span>
          <Button
            variant="ghost"
            type="button"
            onClick={() =>
              setWarehousePage((page) =>
                Math.min(
                  warehouseQuery.data?.pagination.totalPages || 1,
                  page + 1,
                ),
              )
            }
            disabled={
              warehouseQuery.isFetching ||
              warehousePage >= (warehouseQuery.data?.pagination.totalPages || 1)
            }
          >
            Siguiente
          </Button>
        </div>
      </form>

      {accessIssue ? (
        <section className="activity-state activity-state--error" role="alert">
          <h3>No se puede mostrar el reporte</h3>
          <p>{accessIssue}</p>
        </section>
      ) : null}
      {!accessIssue && activityQuery.isError ? (
        <section className="activity-state activity-state--error" role="alert">
          <h3>
            {accessError instanceof ApiError && accessError.status === 401
              ? "La sesión venció"
              : accessError instanceof ApiError && accessError.status === 403
                ? "Acceso denegado"
                : "No se pudo consultar el reporte"}
          </h3>
          <p>
            {serverOffsetError
              ? "Este desplazamiento supera el límite permitido. Reduce el período o selecciona una bodega."
              : accessError?.message ||
                "Comprueba la conexión e inténtalo de nuevo."}
          </p>
          <Button
            variant="secondary"
            type="button"
            onClick={() => void activityQuery.refetch()}
          >
            Reintentar
          </Button>
        </section>
      ) : null}

      {result && !activityQuery.isError && !accessIssue ? (
        <>
          <section
            className="activity-metrics purchase-report-metrics"
            aria-label="Resumen del período"
            aria-busy={activityQuery.isFetching}
          >
            <Metric
              title="Valor de mercancía recibida"
              value={result.summary.receivedValue}
              detail="Costo documentado original de las cantidades recibidas"
            />
            <Metric
              title="Valor equivalente de devoluciones"
              value={result.summary.supplierReturnEquivalent}
              detail="Costo original de la mercancía devuelta"
              variant="activity-metric--returns"
            />
            <Metric
              title="Recepciones menos devoluciones"
              value={result.summary.referenceNetReceivedValue}
              detail="Diferencia de referencia del período"
              variant="activity-metric--balance"
            />
          </section>
          <p className="activity-explanation">
            <strong>Devoluciones:</strong> Este valor no representa
            necesariamente dinero reembolsado por el proveedor.
          </p>
          <p className="activity-explanation activity-explanation--balance">
            <strong>Valor de referencia:</strong> Indicador de referencia
            comercial. No representa compras netas contables, utilidad ni saldo
            de caja.
          </p>
          <section
            className="activity-quantities"
            aria-labelledby="purchase-quantities-title"
          >
            <div className="activity-section-heading">
              <div>
                <h3 id="purchase-quantities-title">
                  Cantidades por unidad histórica
                </h3>
                <p>
                  Las diferencias físicas no representan existencias actuales.
                </p>
              </div>
            </div>
            {result.summary.quantitiesByUnit.length ? (
              <div className="activity-quantity-grid">
                {result.summary.quantitiesByUnit.map((item) => (
                  <article className="activity-quantity-card" key={item.unit}>
                    <h4>{item.unit}</h4>
                    <dl>
                      <div>
                        <dt>Recibidas</dt>
                        <dd>{quantity(item.quantityReceived)}</dd>
                      </div>
                      <div>
                        <dt>Devueltas</dt>
                        <dd>{quantity(item.quantityReturned)}</dd>
                      </div>
                      <div>
                        <dt>Diferencia</dt>
                        <dd>{quantity(item.quantityDifference)}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            ) : (
              <p className="activity-empty-quantity" role="status">
                No hay cantidades recibidas o devueltas en el período.
              </p>
            )}
          </section>
          <p className="purchase-report-coverage">
            El reporte incluye únicamente recepciones y devoluciones cuya
            trazabilidad documental e inventario asociado pudieron verificarse.
          </p>
          <section
            className="activity-table-panel"
            aria-labelledby="purchase-activities-title"
          >
            <div className="activity-section-heading">
              <div>
                <h3 id="purchase-activities-title">Actividades de Compras</h3>
                <p>
                  {result.pagination.total} actividades en el período y bodegas
                  autorizadas.
                </p>
              </div>
              <Button
                variant="secondary"
                type="button"
                onClick={exportCurrentPage}
                disabled={
                  result.activities.length === 0 ||
                  activityQuery.isFetching ||
                  exporting ||
                  Boolean(accessIssue)
                }
              >
                {exporting ? "Preparando CSV…" : "Exportar resultados (CSV)"}
              </Button>
              <span className="activity-timezone">Fechas: America/Bogota</span>
            </div>
            {exportError ? (
              <p className="form-error" role="alert">
                {exportError}
              </p>
            ) : null}
            <DataTable
              columns={columns}
              data={result.activities}
              page={result.pagination.page}
              pageSize={result.pagination.pageSize}
              total={result.pagination.total}
              sortBy="occurredAt"
              sortOrder="desc"
              onSortChange={() => {}}
              loading={activityQuery.isPending}
              loadingLabel="Cargando actividades…"
              regionLabel="Tabla de Recepciones y Devoluciones de Compras"
              emptyLabel="No hay recepciones ni devoluciones para este período y alcance."
            />
            {result.pagination.total > 0 ? (
              <nav
                className="activity-pagination"
                aria-label="Paginación de actividades de Compras"
              >
                <span>
                  Página {result.pagination.page} de{" "}
                  {Math.max(result.pagination.totalPages, 1)}
                </span>
                <div>
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => changePage(applied.page - 1)}
                    disabled={applied.page <= 1 || activityQuery.isFetching}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => changePage(applied.page + 1)}
                    disabled={
                      applied.page >= result.pagination.totalPages ||
                      activityQuery.isFetching ||
                      applied.page * pageSize > 10000
                    }
                  >
                    Siguiente
                  </Button>
                </div>
              </nav>
            ) : null}
          </section>
        </>
      ) : null}
      {!result && activityQuery.isPending && !accessIssue ? (
        <section className="activity-state" role="status">
          Cargando Recepciones y Devoluciones de Compras…
        </section>
      ) : null}
      {result?.generatedAt ? (
        <p className="purchase-report-generated">
          Datos generados {formatBogotaDateTime(result.generatedAt)}
        </p>
      ) : null}
    </section>
  );
}
