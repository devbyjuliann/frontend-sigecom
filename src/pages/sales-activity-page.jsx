import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowClockwise } from "@phosphor-icons/react/ArrowClockwise";
import { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { Receipt } from "@phosphor-icons/react/Receipt";
import { Button } from "../components/ui/button.jsx";
import { Input } from "../components/ui/input.jsx";
import { createCsv, downloadCsv } from "../lib/csv.js";
import { fetchAllReportRows } from "../lib/csv-export.js";
import DataTable from "../components/data-table.jsx";
import { useAuth } from "../auth/auth-context.jsx";
import { ApiError, reportApi } from "../lib/auth-api.js";
import {
  defaultSalesActivityPeriod,
  formatBogotaDateTime,
  formatExactCop,
  formatExactQuantity,
  validateSalesActivityFilters,
} from "../lib/sales-activity.js";

const pageSize = 20;
const warehousePageSize = 20;
const activityLabels = {
  sale_confirmation: "Venta confirmada",
  sale_cancellation: "Venta anulada",
  customer_return: "Devolución de cliente",
};

function identityScope(session) {
  return JSON.stringify({
    id: session?.user?.id || "",
    role: session?.user?.role || "",
    permissions: [...(session?.permissions || [])].sort(),
  });
}

function metric(title, amount, detail, variant = "") {
  return (
    <article className={`activity-metric${variant ? ` ${variant}` : ""}`}>
      <h2>{title}</h2>
      <p className="activity-metric__value">{formatExactCop(amount)}</p>
      {detail ? <p className="activity-metric__detail">{detail}</p> : null}
    </article>
  );
}

function formatQuantity(value) {
  return formatExactQuantity(value) ?? "Cantidad no disponible";
}

export default function SalesActivityPage() {
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
  const initialPeriod = useMemo(() => defaultSalesActivityPeriod(), []);
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
    if (previousIdentity.current !== identity) {
      queryClient.removeQueries({ queryKey: ["sales-activity"] });
      previousIdentity.current = identity;
      setAccessIssue("");
      setSelectedWarehouse(null);
      setDraft({ ...defaultSalesActivityPeriod(), warehouseId: "" });
      setApplied({ ...defaultSalesActivityPeriod(), warehouseId: "", page: 1 });
      setWarehouseSearchDraft("");
      setWarehouseSearch("");
      setWarehousePage(1);
    }
  }, [identity, queryClient]);

  const warehouseQuery = useQuery({
    queryKey: [
      "sales-activity",
      "warehouses",
      identity,
      warehouseSearch,
      warehousePage,
    ],
    queryFn: ({ signal }) =>
      reportApi.salesActivityWarehouses(
        {
          q: warehouseSearch,
          page: warehousePage,
          pageSize: warehousePageSize,
        },
        { signal },
      ),
    retry: false,
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
    queryKey: ["sales-activity", "activities", identity, requestFilters],
    queryFn: ({ signal }) =>
      reportApi.salesActivity(requestFilters, { signal }),
    retry: false,
    enabled: !accessIssue,
  });

  useEffect(() => {
    const errors = [warehouseQuery.error, activityQuery.error].filter(Boolean);
    if (!errors.length) return;
    const denied = errors.find(
      (error) => error instanceof ApiError && [401, 403].includes(error.status),
    );
    if (!denied) return;
    // A server-side denial changes the authorization state; hide report data immediately.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAccessIssue(
      denied.status === 401
        ? "La sesión expiró. Inicia sesión nuevamente para consultar este reporte."
        : "Tu sesión ya no tiene permisos para consultar Actividad de Ventas.",
    );
    queryClient.removeQueries({ queryKey: ["sales-activity"] });
  }, [activityQuery.error, queryClient, warehouseQuery.error]);

  const warehouses = warehouseQuery.data?.items || [];
  const currentSelectedWarehouse =
    warehouses.find((warehouse) => warehouse.id === draft.warehouseId) ||
    (selectedWarehouse?.id === draft.warehouseId ? selectedWarehouse : null);

  const columns = useMemo(
    () => [
      {
        id: "occurredAt",
        header: "Fecha",
        accessorFn: (activity) => activity.occurredAt,
        cell: ({ getValue }) => formatBogotaDateTime(getValue()),
      },
      {
        id: "activity",
        header: "Tipo de actividad",
        accessorFn: (activity) => activity.type,
        cell: ({ getValue }) =>
          activityLabels[getValue()] || "Actividad comercial",
      },
      {
        id: "document",
        header: "Documento",
        cell: ({ row }) => (
          <span className="activity-document">
            <span>{row.original.sale.number}</span>
            <small>
              {row.original.type === "sale_confirmation"
                ? `Venta ${row.original.sale.id}`
                : row.original.type === "sale_cancellation"
                  ? `Anulación ${row.original.sourceId}`
                  : `Devolución ${row.original.sourceId}`}
            </small>
          </span>
        ),
      },
      {
        id: "warehouse",
        header: "Bodega",
        accessorFn: (activity) => activity.warehouse.name,
        cell: ({ row }) =>
          `${row.original.warehouse.code} · ${row.original.warehouse.name}`,
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
              {row.original.quantitiesByUnit.map((quantity) => (
                <li key={`${row.original.id}-${quantity.unit}`}>
                  {quantity.unit}: recibidas{" "}
                  {formatQuantity(quantity.quantityReceived)} · reintegradas{" "}
                  {formatQuantity(quantity.quantityRestocked)}
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
    if (!validateSalesActivityFilters(draft)) {
      setValidationError(
        "Indica fechas reales en orden válido y un período máximo de 92 días calendario, contando ambos extremos.",
      );
      return;
    }
    setValidationError("");
    setApplied({ ...draft, page: 1 });
  }

  function clearFilters() {
    const period = defaultSalesActivityPeriod();
    const next = { ...period, warehouseId: "" };
    setDraft(next);
    setApplied({ ...next, page: 1 });
    setSelectedWarehouse(null);
    setValidationError("");
  }

  function changePage(nextPage) {
    const totalPages = activityQuery.data?.pagination?.totalPages || 1;
    if (nextPage < 1 || nextPage > totalPages) return;
    setApplied((current) => ({ ...current, page: nextPage }));
  }

  function submitWarehouseSearch(event) {
    event.preventDefault();
    setWarehouseSearch(warehouseSearchDraft.trim());
    setWarehousePage(1);
  }

  function handleWarehouseChange(event) {
    const id = event.target.value;
    const selected =
      warehouses.find((warehouse) => warehouse.id === id) || null;
    setSelectedWarehouse(selected);
    updateDraft("warehouseId", id);
  }

  async function exportCurrentPage() {
    exportController.current?.abort();
    const controller = new AbortController();
    exportController.current = controller;
    setExporting(true);
    setExportError("");
    try {
      const exportFilters = {
        dateFrom: applied.dateFrom,
        dateTo: applied.dateTo,
        ...(applied.warehouseId ? { warehouseId: applied.warehouseId } : {}),
      };
      const activities = await fetchAllReportRows({
        fetchPage: reportApi.salesActivity,
        filters: exportFilters,
        pageSize: 100,
        identity,
        getCurrentIdentity: () => identityRef.current,
        signal: controller.signal,
        rowsKey: "activities",
      });
      const columns = [
        { key: "occurredAt", label: "Fecha" },
        { key: "activity", label: "Tipo de actividad" },
        { key: "document", label: "Documento" },
        { key: "warehouse", label: "Bodega" },
        { key: "amount", label: "Importe COP", type: "number" },
        { key: "quantities", label: "Cantidades" },
      ];
      const rows = activities.map((activity) => ({
        occurredAt: formatBogotaDateTime(activity.occurredAt),
        activity: activityLabels[activity.type] || "Actividad comercial",
        document: `${activity.sale.number} · ${
          activity.type === "sale_confirmation"
            ? `Venta ${activity.sale.id}`
            : activity.type === "sale_cancellation"
              ? `Anulación ${activity.sourceId}`
              : `Devolución ${activity.sourceId}`
        }`,
        warehouse: `${activity.warehouse.code} · ${activity.warehouse.name}`,
        amount: activity.amount,
        quantities: (activity.quantitiesByUnit || [])
          .map(
            (item) =>
              `${item.unit}: recibidas ${item.quantityReceived}, reintegradas ${item.quantityRestocked}`,
          )
          .join("; "),
      }));
      const date = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      downloadCsv(
        `actividad-ventas-completa-${date}.csv`,
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

  const result = activityQuery.data;
  const totalPages = result?.pagination?.totalPages || 1;
  const failure = activityQuery.error;
  const serverOffsetError =
    failure instanceof ApiError && failure.code === "PAGE_OFFSET_TOO_LARGE";

  return (
    <section className="page-section sales-activity-page">
      <header className="page-heading sales-activity-heading">
        <div>
          <p className="page-kicker">Reportes operativos</p>
          <h2>Actividad de Ventas</h2>
          <p>
            Consulta confirmaciones, anulaciones y devoluciones según sus fechas
            reales y las bodegas asignadas a tu usuario.
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
          <h3>Actividad de Ventas</h3>
          <p>
            Un registro cronológico de hechos comerciales. Las cifras resumen
            todo el período, no solo esta página.
          </p>
        </div>
        {result ? (
          <span className="activity-report-time">
            Consultado {formatBogotaDateTime(result.generatedAt)}
          </span>
        ) : null}
      </section>

      <form
        className="activity-filters"
        onSubmit={applyFilters}
        aria-label="Filtros de Actividad de Ventas"
      >
        <div className="activity-filter-fields">
          <div className="form-field">
            <label htmlFor="activity-date-from">Desde</label>
            <Input
              id="activity-date-from"
              type="date"
              value={draft.dateFrom}
              onChange={(event) => updateDraft("dateFrom", event.target.value)}
              aria-invalid={Boolean(validationError)}
              aria-describedby={
                validationError ? "activity-filter-error" : undefined
              }
            />
          </div>
          <div className="form-field">
            <label htmlFor="activity-date-to">Hasta</label>
            <Input
              id="activity-date-to"
              type="date"
              value={draft.dateTo}
              onChange={(event) => updateDraft("dateTo", event.target.value)}
              aria-invalid={Boolean(validationError)}
              aria-describedby={
                validationError ? "activity-filter-error" : undefined
              }
            />
          </div>
          <div className="form-field activity-warehouse-field">
            <label htmlFor="activity-warehouse">Bodega</label>
            <select
              id="activity-warehouse"
              className="input-control"
              value={draft.warehouseId}
              onChange={handleWarehouseChange}
              disabled={
                warehouseQuery.isPending ||
                warehouseQuery.isError ||
                Boolean(accessIssue)
              }
            >
              <option value="">Todas mis bodegas</option>
              {currentSelectedWarehouse &&
              !warehouses.some(
                (warehouse) => warehouse.id === currentSelectedWarehouse.id,
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
            role="alert"
            id="activity-filter-error"
          >
            {validationError}
          </p>
        ) : null}
      </form>

      <form
        className="activity-warehouse-search"
        onSubmit={submitWarehouseSearch}
        aria-label="Buscar bodegas asignadas"
      >
        <label htmlFor="activity-warehouse-search">Buscar en mis bodegas</label>
        <Input
          id="activity-warehouse-search"
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
          <MagnifyingGlass size={17} aria-hidden="true" /> Buscar
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
            onClick={() => setWarehousePage((page) => page + 1)}
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
          <h3>No se pudo consultar Actividad de Ventas</h3>
          <p>
            {serverOffsetError
              ? "Este desplazamiento supera el límite permitido. Reduce el período o selecciona una bodega."
              : failure?.message ||
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
            className="activity-metrics"
            aria-label="Resumen del período"
            aria-busy={activityQuery.isFetching}
          >
            {metric(
              "Bruto confirmado",
              result.summary.grossConfirmed,
              "Ventas confirmadas en el período",
            )}
            {metric(
              "Anulaciones",
              result.summary.cancellations,
              "Ventas confirmadas anuladas en el período",
            )}
            {metric(
              "Valor equivalente de devoluciones",
              result.summary.returnEquivalent,
              "Al precio original de venta",
              "activity-metric--returns",
            )}
            {metric(
              "Saldo comercial de referencia",
              result.summary.referenceCommercialBalance,
              "Bruto − anulaciones − devoluciones",
              "activity-metric--balance",
            )}
          </section>
          <p className="activity-explanation">
            <strong>Devoluciones:</strong> Este valor no representa
            necesariamente dinero reembolsado al cliente.
          </p>
          <p className="activity-explanation activity-explanation--balance">
            <strong>Saldo:</strong> Indicador de referencia comercial. No
            representa utilidad, ventas netas contables ni saldo de caja.
          </p>

          <section
            className="activity-quantities"
            aria-labelledby="activity-quantities-title"
          >
            <div className="activity-section-heading">
              <div>
                <h3 id="activity-quantities-title">Mercancía devuelta</h3>
                <p>
                  Unidades recibidas y reintegradas, agrupadas por unidad de
                  medida.
                </p>
              </div>
            </div>
            {result.summary.quantitiesByUnit.length ? (
              <div className="activity-quantity-grid">
                {result.summary.quantitiesByUnit.map((quantity) => (
                  <article
                    className="activity-quantity-card"
                    key={quantity.unit}
                  >
                    <h4>{quantity.unit}</h4>
                    <dl>
                      <div>
                        <dt>Recibidas</dt>
                        <dd>{formatQuantity(quantity.quantityReceived)}</dd>
                      </div>
                      <div>
                        <dt>Reintegradas a existencias</dt>
                        <dd>{formatQuantity(quantity.quantityRestocked)}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            ) : (
              <p className="activity-empty-quantity" role="status">
                No se registran devoluciones en el período consultado.
              </p>
            )}
          </section>

          <section
            className="activity-table-panel"
            aria-labelledby="activity-table-title"
          >
            <div className="activity-section-heading">
              <div>
                <h3 id="activity-table-title">Hechos comerciales</h3>
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
            {activityQuery.isPending ? (
              <DataTable
                columns={columns}
                data={[]}
                page={applied.page}
                pageSize={pageSize}
                total={result.pagination.total}
                sortBy="occurredAt"
                sortOrder="desc"
                onSortChange={() => {}}
                loading
                loadingLabel="Actualizando actividades…"
              />
            ) : (
              <DataTable
                columns={columns}
                data={result.activities}
                page={result.pagination.page}
                pageSize={result.pagination.pageSize}
                total={result.pagination.total}
                sortBy="occurredAt"
                sortOrder="desc"
                onSortChange={() => {}}
                regionLabel="Tabla de Actividad de Ventas"
                emptyLabel="No hay actividades de ventas para este período y alcance."
              />
            )}
            {result.activities.length ? (
              <nav
                className="activity-pagination"
                aria-label="Paginación de actividades"
              >
                <span>
                  Página {result.pagination.page} de {totalPages}
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
                      applied.page >= totalPages || activityQuery.isFetching
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
          Cargando Actividad de Ventas…
        </section>
      ) : null}
    </section>
  );
}
