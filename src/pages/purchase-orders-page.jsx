import { useEffect, useMemo, useRef, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowClockwise } from "@phosphor-icons/react/ArrowClockwise";
import { CaretDown } from "@phosphor-icons/react/CaretDown";
import { CaretUp } from "@phosphor-icons/react/CaretUp";
import { Button } from "../components/ui/button.jsx";
import { Input } from "../components/ui/input.jsx";
import DataTable from "../components/data-table.jsx";
import { useAuth } from "../auth/auth-context.jsx";
import { ApiError, reportApi } from "../lib/auth-api.js";
import {
  defaultPurchaseReceiptsPeriod,
  formatExactSignedQuantity,
  validatePurchaseReceiptsFilters,
} from "../lib/purchase-receipts.js";
import { formatBogotaDateTime, formatExactCop } from "../lib/sales-activity.js";

const queryRoot = "purchase-orders-report";
const statusLabels = {
  draft: "Borrador",
  cancelled: "Cancelada",
  confirmed: "Confirmada",
};
const situationLabels = {
  draft_without_lines: "Borrador sin productos",
  draft: "Borrador",
  cancelled: "Cancelada",
  confirmed_without_receipts: "Confirmada sin recepción",
  partially_received: "Parcialmente recibida",
  fully_received: "Completamente recibida",
  closed_with_remnant: "Cerrada con remanente",
};
const column = createColumnHelper();

function identityScope(session) {
  return JSON.stringify({
    id: session?.user?.id || "",
    role: session?.user?.role || "",
    permissions: [...(session?.permissions || [])].sort(),
  });
}

function Metric({ label, value, note }) {
  return (
    <article className="activity-metric">
      <h3>{label}</h3>
      <p className="activity-metric__value">{value}</p>
      {note ? <p className="activity-metric__detail">{note}</p> : null}
    </article>
  );
}

function quantity(value) {
  return value === null
    ? "No aplica"
    : (formatExactSignedQuantity(value) ?? "No disponible");
}

function hasControlCharacters(value) {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

function ExpandedLines({ order }) {
  return (
    <div className="purchase-expanded-order">
      <h3>Líneas de la orden {order.commercialCode}</h3>
      <div
        className="data-table-scroll"
        role="region"
        aria-label={`Líneas de la orden ${order.commercialCode}`}
        tabIndex={0}
      >
        <table className="data-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Unidad histórica</th>
              <th>Ordenada</th>
              <th>Recibida</th>
              <th>Pendiente operativo</th>
              <th>Remanente cerrado</th>
              <th>Costo unitario original</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((line) => (
              <tr key={line.id}>
                <td>
                  {line.name}
                  <small className="block text-muted">{line.sku}</small>
                </td>
                <td>{line.unit}</td>
                <td>{quantity(line.quantity)}</td>
                <td>{quantity(line.receivedQuantity)}</td>
                <td>{quantity(line.pendingQuantity)}</td>
                <td>{quantity(line.closedQuantity)}</td>
                <td>
                  {line.unitCost === null
                    ? "No aplica"
                    : formatExactCop(line.unitCost)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PurchaseOrdersPage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const identity = identityScope(session);
  const permissions = [...(session?.permissions || [])].sort().join(",");
  const previousIdentity = useRef(identity);
  const initialPeriod = useMemo(() => defaultPurchaseReceiptsPeriod(), []);
  const [mode, setMode] = useState("pending");
  const [draft, setDraft] = useState({
    ...initialPeriod,
    warehouseId: "",
    q: "",
    situation: "",
  });
  const [applied, setApplied] = useState({
    mode: "pending",
    warehouseId: "",
    q: "",
    situation: "",
    page: 1,
  });
  const [warehouseSearch, setWarehouseSearch] = useState("");
  const [warehousePage, setWarehousePage] = useState(1);
  const [selectedWarehouse, setSelectedWarehouse] = useState(null);
  const [validationError, setValidationError] = useState("");
  const [accessIssue, setAccessIssue] = useState("");
  const [expanded, setExpanded] = useState(() => new Set());

  useEffect(() => {
    if (previousIdentity.current === identity) return;
    previousIdentity.current = identity;
    queryClient.removeQueries({ queryKey: [queryRoot] });
    setAccessIssue("");
    setExpanded(new Set());
    setSelectedWarehouse(null);
    setMode("pending");
    setDraft({ ...initialPeriod, warehouseId: "", q: "", situation: "" });
    setApplied({
      mode: "pending",
      warehouseId: "",
      q: "",
      situation: "",
      page: 1,
    });
  }, [identity, initialPeriod, queryClient]);

  const warehouseQuery = useQuery({
    queryKey: [
      queryRoot,
      "warehouses",
      identity,
      permissions,
      warehouseSearch,
      warehousePage,
    ],
    queryFn: ({ signal }) =>
      reportApi.purchaseReceiptWarehouses(
        { q: warehouseSearch, page: warehousePage, pageSize: 20 },
        { signal },
      ),
    retry: false,
    enabled: !accessIssue,
  });
  const filters = useMemo(
    () => ({
      mode: applied.mode,
      ...(applied.mode === "period"
        ? { dateFrom: applied.dateFrom, dateTo: applied.dateTo }
        : {}),
      ...(applied.warehouseId ? { warehouseId: applied.warehouseId } : {}),
      ...(applied.q ? { q: applied.q } : {}),
      ...(applied.situation ? { situation: applied.situation } : {}),
      page: applied.page,
      pageSize: 20,
    }),
    [applied],
  );
  const reportQuery = useQuery({
    queryKey: [queryRoot, "orders", identity, permissions, filters],
    queryFn: ({ signal }) => reportApi.purchaseOrders(filters, { signal }),
    retry: false,
    enabled: !accessIssue,
  });
  useEffect(() => {
    const denied = [warehouseQuery.error, reportQuery.error].find(
      (error) => error instanceof ApiError && [401, 403].includes(error.status),
    );
    if (!denied) return;
    // Denial latch prevents a removed sensitive response from being refetched or rendered.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAccessIssue(
      denied.status === 401
        ? "La sesión expiró. Inicia sesión nuevamente para consultar este reporte."
        : "Tu sesión ya no tiene permisos para consultar Órdenes de Compra y Pendientes.",
    );
    queryClient.removeQueries({ queryKey: [queryRoot] });
    setExpanded(new Set());
    if (denied.status === 401)
      void queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
  }, [warehouseQuery.error, reportQuery.error, queryClient]);

  const result = accessIssue ? null : reportQuery.data;
  const warehouses = warehouseQuery.data?.items || [];
  const chosenWarehouse =
    warehouses.find(({ id }) => id === draft.warehouseId) ||
    (selectedWarehouse?.id === draft.warehouseId ? selectedWarehouse : null);
  const columns = useMemo(
    () => [
      column.accessor("commercialCode", { header: "Código de orden" }),
      column.accessor("orderDate", { header: "Fecha documental" }),
      column.accessor(
        (order) => `${order.warehouse.code} — ${order.warehouse.name}`,
        { id: "warehouse", header: "Bodega" },
      ),
      column.accessor((order) => statusLabels[order.status] || order.status, {
        id: "status",
        header: "Estado documental",
      }),
      column.accessor(
        (order) => situationLabels[order.situation] || order.situation,
        { id: "situation", header: "Situación actual" },
      ),
      column.accessor((order) => formatExactCop(order.orderedValue), {
        id: "orderedValue",
        header: "Valor original",
      }),
      column.display({
        id: "lines",
        header: "Líneas",
        cell: ({ row }) => (
          <button
            type="button"
            className="table-sort"
            aria-expanded={expanded.has(row.original.id)}
            aria-controls={`purchase-order-lines-${row.original.id}`}
            onClick={() =>
              setExpanded((current) => {
                const next = new Set(current);
                next.has(row.original.id)
                  ? next.delete(row.original.id)
                  : next.add(row.original.id);
                return next;
              })
            }
          >
            {expanded.has(row.original.id) ? (
              <>
                <CaretUp aria-hidden="true" /> Ocultar
              </>
            ) : (
              <>
                <CaretDown aria-hidden="true" /> Consultar líneas
              </>
            )}
          </button>
        ),
      }),
    ],
    [expanded],
  );

  function submit(event) {
    event.preventDefault();
    setValidationError("");
    const q = draft.q.trim();
    if (q.length > 100 || hasControlCharacters(q)) {
      setValidationError(
        "La referencia comercial debe tener hasta 100 caracteres y no incluir controles.",
      );
      return;
    }
    if (mode === "period" && !validatePurchaseReceiptsFilters(draft)) {
      setValidationError(
        "Ingresa fechas válidas, en orden y dentro de un máximo inclusivo de 92 días.",
      );
      return;
    }
    setExpanded(new Set());
    setApplied({
      mode,
      ...(mode === "period"
        ? { dateFrom: draft.dateFrom, dateTo: draft.dateTo }
        : {}),
      warehouseId: draft.warehouseId,
      q,
      situation: draft.situation,
      page: 1,
    });
  }
  function clearFilters() {
    setDraft({ ...initialPeriod, warehouseId: "", q: "", situation: "" });
    setMode("pending");
    setValidationError("");
    setExpanded(new Set());
    setApplied({
      mode: "pending",
      warehouseId: "",
      q: "",
      situation: "",
      page: 1,
    });
  }
  function changeMode(next) {
    setMode(next);
    setValidationError("");
    setExpanded(new Set());
    setDraft((current) => ({
      ...current,
      situation:
        next === "pending" &&
        !["confirmed_without_receipts", "partially_received"].includes(
          current.situation,
        )
          ? ""
          : current.situation,
    }));
    setApplied((current) => ({
      mode: next,
      warehouseId: current.warehouseId,
      q: current.q,
      situation:
        next === "pending" &&
        !["confirmed_without_receipts", "partially_received"].includes(
          current.situation,
        )
          ? ""
          : current.situation,
      ...(next === "period" ? { ...initialPeriod } : {}),
      page: 1,
    }));
  }

  const summary = result?.summary;
  const pagination = result?.pagination;
  const totalPages = Math.max(1, Number(pagination?.totalPages || 0));
  const orders = result?.orders || [];
  const pendingMode = applied.mode === "pending";
  const statusCounts = summary?.byDocumentStatus || {};
  const situationCounts = summary?.bySituation || {};
  const units = (items) =>
    items?.length ? (
      items.map((item) => (
        <span key={item.unit}>
          {item.unit}: {quantity(item.quantity)}
        </span>
      ))
    ) : (
      <span>Sin cantidades verificables</span>
    );

  return (
    <section className="page-section sales-activity-page purchase-orders-report">
      <header className="page-heading sales-activity-heading">
        <div>
          <p className="page-kicker">Reportes operativos</p>
          <h2>Órdenes de Compra y Pendientes</h2>
          <p>
            Consulta el estado actual de las órdenes de compra, las cantidades
            recibidas, los pendientes operativos y los remanentes cerrados.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => void reportQuery.refetch()}
          disabled={reportQuery.isFetching || Boolean(accessIssue)}
        >
          <ArrowClockwise size={17} aria-hidden="true" />
          Actualizar
        </Button>
      </header>
      <section
        className="activity-report-banner"
        aria-label="Alcance del reporte"
      >
        <div>
          <h3>{pendingMode ? "Pendientes actuales" : "Órdenes por período"}</h3>
          <p>
            {pendingMode
              ? "Se muestran los pendientes actuales de todas las fechas documentales, dentro de tus bodegas asignadas"
              : "Se muestran órdenes fechadas durante el período seleccionado y su situación actual al consultar"}
          </p>
          <p>
            Las cifras incluyen únicamente órdenes cuya información documental y
            recepciones relacionadas pudieron verificarse.
          </p>
          <p>
            El resumen corresponde a todos los resultados filtrados, no solo a
            esta página.
          </p>
        </div>
      </section>
      <form
        className="activity-filters"
        aria-label="Filtros de Órdenes de Compra"
        onSubmit={submit}
      >
        <div className="activity-filter-fields">
          <div className="form-field">
            <label htmlFor="purchase-orders-mode">Modalidad</label>
            <select
              id="purchase-orders-mode"
              className="input-control"
              value={mode}
              onChange={(event) => changeMode(event.target.value)}
            >
              <option value="pending">Pendientes actuales</option>
              <option value="period">Órdenes por período</option>
            </select>
          </div>
          {mode === "period" ? (
            <>
              <div className="form-field">
                <label htmlFor="purchase-orders-from">Desde</label>
                <Input
                  id="purchase-orders-from"
                  type="date"
                  value={draft.dateFrom}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      dateFrom: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="form-field">
                <label htmlFor="purchase-orders-to">Hasta</label>
                <Input
                  id="purchase-orders-to"
                  type="date"
                  value={draft.dateTo}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      dateTo: event.target.value,
                    }))
                  }
                />
              </div>
            </>
          ) : null}
          <div className="form-field activity-warehouse-field">
            <label htmlFor="purchase-orders-warehouse">Bodega</label>
            <select
              id="purchase-orders-warehouse"
              className="input-control"
              value={draft.warehouseId}
              onChange={(event) => {
                const warehouse = warehouses.find(
                  ({ id }) => id === event.target.value,
                );
                setSelectedWarehouse(warehouse || null);
                setDraft((current) => ({
                  ...current,
                  warehouseId: event.target.value,
                }));
              }}
            >
              <option value="">Todas mis bodegas</option>
              {chosenWarehouse &&
              !warehouses.some(({ id }) => id === chosenWarehouse.id) ? (
                <option value={chosenWarehouse.id}>
                  {chosenWarehouse.code} — {chosenWarehouse.name}
                  {chosenWarehouse.isActive ? "" : " (inactiva)"}
                </option>
              ) : null}
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.code} — {warehouse.name}
                  {warehouse.isActive ? "" : " (inactiva)"}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="purchase-orders-q">
              Referencia comercial actual
            </label>
            <Input
              id="purchase-orders-q"
              type="search"
              maxLength={100}
              value={draft.q}
              onChange={(event) =>
                setDraft((current) => ({ ...current, q: event.target.value }))
              }
            />
          </div>
          <div className="form-field">
            <label htmlFor="purchase-orders-situation">Situación</label>
            <select
              id="purchase-orders-situation"
              className="input-control"
              value={draft.situation}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  situation: event.target.value,
                }))
              }
            >
              <option value="">Todas</option>
              {Object.entries(situationLabels)
                .filter(
                  ([key]) =>
                    mode === "period" ||
                    [
                      "confirmed_without_receipts",
                      "partially_received",
                    ].includes(key),
                )
                .map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
            </select>
          </div>
        </div>
        <div className="activity-filter-actions">
          <Button type="submit">Consultar</Button>
          <Button type="button" variant="secondary" onClick={clearFilters}>
            Limpiar filtros
          </Button>
        </div>
        {validationError ? (
          <p className="form-error" role="alert">
            {validationError}
          </p>
        ) : null}
      </form>
      <form
        className="activity-warehouse-search"
        aria-label="Buscar bodegas asignadas"
        onSubmit={(event) => {
          event.preventDefault();
          setWarehousePage(1);
        }}
      >
        <label htmlFor="purchase-orders-warehouse-search">
          Buscar en mis bodegas
        </label>
        <Input
          id="purchase-orders-warehouse-search"
          maxLength={100}
          value={warehouseSearch}
          onChange={(event) => {
            setWarehouseSearch(event.target.value);
            setWarehousePage(1);
          }}
        />
        <div className="activity-warehouse-pages">
          <Button
            type="button"
            variant="ghost"
            disabled={warehousePage <= 1}
            onClick={() => setWarehousePage((page) => page - 1)}
          >
            Anterior
          </Button>
          <span>
            Página {warehousePage} de{" "}
            {Math.max(
              1,
              Number(warehouseQuery.data?.pagination?.totalPages || 0),
            )}
          </span>
          <Button
            type="button"
            variant="ghost"
            disabled={
              warehousePage >=
              Math.max(
                1,
                Number(warehouseQuery.data?.pagination?.totalPages || 0),
              )
            }
            onClick={() => setWarehousePage((page) => page + 1)}
          >
            Siguiente
          </Button>
        </div>
      </form>
      {accessIssue ? (
        <section className="activity-state" role="alert">
          {accessIssue}
        </section>
      ) : reportQuery.isError ? (
        <section className="activity-state" role="alert">
          {reportQuery.error?.message ||
            "No fue posible consultar el reporte. Intenta nuevamente."}
        </section>
      ) : null}
      {result && !accessIssue ? (
        <>
          <section className="activity-metrics" aria-label="Resumen documental">
            <Metric
              label="Órdenes verificables"
              value={summary?.verifiedOrders ?? "0"}
            />
            <Metric
              label="Órdenes con pendientes actuales"
              value={summary?.ordersWithPending ?? "0"}
            />
            <Metric
              label="Órdenes cerradas con remanente"
              value={summary?.ordersClosedWithRemnant ?? "0"}
            />
            <Metric
              label="Valor original de órdenes actualmente confirmadas"
              value={formatExactCop(summary?.originalConfirmedOrderValue)}
              note="Corresponde al valor documentado originalmente. No representa mercancía recibida, deuda ni pagos realizados."
            />
          </section>
          <section className="purchase-orders-breakdowns">
            <div>
              <h3>Estados documentales</h3>
              {Object.entries(statusLabels).map(([key, label]) => (
                <span key={key}>
                  {label}: {statusCounts[key] ?? "0"}
                </span>
              ))}
            </div>
            <div>
              <h3>Situación de seguimiento</h3>
              {Object.entries(situationLabels).map(([key, label]) => (
                <span key={key}>
                  {label}: {situationCounts[key] ?? "0"}
                </span>
              ))}
            </div>
            <div>
              <h3>Cantidades pendientes operativas</h3>
              {units(summary?.pendingByUnit)}
            </div>
            <div>
              <h3>Remanentes cerrados</h3>
              {units(summary?.closedByUnit)}
            </div>
          </section>
          <section className="activity-table-panel">
            <div className="activity-table-heading">
              <div>
                <h3>Órdenes consultadas</h3>
                <p>Generado: {formatBogotaDateTime(result.generatedAt)}</p>
              </div>
            </div>
            <DataTable
              columns={columns}
              data={orders}
              page={applied.page}
              pageSize={20}
              total={Number(pagination?.total || 0)}
              sortBy="orderDate"
              sortOrder="asc"
              onSortChange={() => {}}
              loading={reportQuery.isPending || reportQuery.isFetching}
              regionLabel="Tabla de Órdenes de Compra y Pendientes"
              emptyLabel={
                pendingMode
                  ? "No se encontraron órdenes verificables con pendientes actuales y los filtros seleccionados."
                  : "No se encontraron órdenes verificables con los filtros seleccionados."
              }
              expandedRowIds={expanded}
              renderExpandedRow={(order) => (
                <div id={`purchase-order-lines-${order.id}`}>
                  <ExpandedLines order={order} />
                </div>
              )}
            />
            <div className="activity-pagination">
              <span>
                Página {applied.page} de {totalPages} ·{" "}
                {pagination?.total ?? "0"} órdenes verificables
              </span>
              <Button
                type="button"
                variant="secondary"
                disabled={applied.page <= 1 || reportQuery.isFetching}
                onClick={() => {
                  setExpanded(new Set());
                  setApplied((current) => ({
                    ...current,
                    page: current.page - 1,
                  }));
                }}
              >
                Anterior
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={applied.page >= totalPages || reportQuery.isFetching}
                onClick={() => {
                  setExpanded(new Set());
                  setApplied((current) => ({
                    ...current,
                    page: current.page + 1,
                  }));
                }}
              >
                Siguiente
              </Button>
            </div>
          </section>
        </>
      ) : !accessIssue && reportQuery.isPending ? (
        <section className="activity-state" role="status">
          Cargando Órdenes de Compra y Pendientes…
        </section>
      ) : null}
    </section>
  );
}
