import { useMemo, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { Package } from "@phosphor-icons/react/Package";
import { ArrowsLeftRight } from "@phosphor-icons/react/ArrowsLeftRight";
import DataTable from "../components/data-table.jsx";
import { Button } from "../components/ui/button.jsx";
import { Input } from "../components/ui/input.jsx";
import { useAuth } from "../auth/auth-context.jsx";
import { inventoryApi, ApiError, warehousesApi } from "../lib/auth-api.js";

const column = createColumnHelper();
const pageSizes = [10, 25, 50];

function StateMessage({ children, tone = "neutral" }) {
  return (
    <div
      className={`inventory-message inventory-message--${tone}`}
      role="status"
    >
      {children}
    </div>
  );
}

export default function InventoryPage() {
  const { session } = useAuth();
  const canRead = session.permissions.includes("inventory.read");
  const canReadMovements = session.permissions.includes(
    "inventory.movements.read",
  );
  const [view, setView] = useState(canRead ? "balances" : "movements");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [stockStatus, setStockStatus] = useState("all");
  const [warehouseId, setWarehouseId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filters = useMemo(
    () => ({ page, pageSize, q: search, stockStatus, warehouseId }),
    [page, pageSize, search, stockStatus, warehouseId],
  );
  const warehousesQuery = useQuery({
    queryKey: ["inventory", "warehouse-filters"],
    queryFn: () =>
      warehousesApi.list({ page: 1, pageSize: 100, status: "all" }),
    enabled:
      canRead ||
      (canReadMovements && session.permissions.includes("warehouses.read")),
    retry: false,
  });
  const balancesQuery = useQuery({
    queryKey: ["inventory", "balances", filters],
    queryFn: () =>
      inventoryApi.balances({
        ...filters,
        sortBy: "product",
        sortOrder: "asc",
      }),
    enabled: canRead && view === "balances",
    retry: false,
  });
  const totalsQuery = useQuery({
    queryKey: ["inventory", "totals", filters],
    queryFn: () => inventoryApi.totals(filters),
    enabled: canRead && view === "totals",
    retry: false,
  });
  const movementsQuery = useQuery({
    queryKey: ["inventory", "movements", page, pageSize, search, warehouseId],
    queryFn: () =>
      inventoryApi.movements({ page, pageSize, q: search, warehouseId }),
    enabled: canReadMovements && view === "movements",
    retry: false,
  });

  const balanceColumns = useMemo(
    () => [
      column.accessor("sku", { header: "SKU" }),
      column.accessor("productName", { header: "Producto" }),
      column.accessor("warehouseName", { header: "Bodega" }),
      column.accessor("quantity", {
        header: "Existencia",
        cell: ({ row }) =>
          row.original.hasBalance
            ? `${row.original.quantity} ${row.original.unit}`
            : "Sin saldo registrado",
      }),
      column.accessor("minimumStock", { header: "Mínimo por bodega" }),
      column.display({
        id: "status",
        header: "Estado",
        cell: ({ row }) =>
          row.original.isLowStock ? (
            <span className="status-badge status-badge--warning">
              Stock bajo
            </span>
          ) : row.original.hasBalance ? (
            <span className="status-badge">Registrado</span>
          ) : (
            <span className="status-badge status-badge--muted">
              No registrado
            </span>
          ),
      }),
    ],
    [],
  );
  const totalColumns = useMemo(
    () => [
      column.accessor("sku", { header: "SKU" }),
      column.accessor("productName", { header: "Producto" }),
      column.accessor("authorizedWarehouseCount", {
        header: "Bodegas autorizadas",
      }),
      column.accessor("registeredBalanceCount", {
        header: "Saldos registrados",
      }),
      column.accessor("totalQuantity", {
        header: "Total autorizado",
        cell: ({ row }) => `${row.original.totalQuantity} ${row.original.unit}`,
      }),
      column.accessor("lowStockWarehouseCount", {
        header: "Bodegas con alerta",
      }),
    ],
    [],
  );
  const movementColumns = useMemo(
    () => [
      column.accessor("createdAt", { header: "Fecha" }),
      column.accessor("sku", { header: "SKU" }),
      column.accessor("productName", { header: "Producto" }),
      column.accessor("warehouseName", { header: "Bodega" }),
      column.accessor("operationType", { header: "Operación" }),
      column.accessor("direction", {
        header: "Tipo",
        cell: ({ getValue }) => (getValue() === "IN" ? "Entrada" : "Salida"),
      }),
      column.accessor("quantity", {
        header: "Cantidad",
        cell: ({ row }) => `${row.original.quantity} ${row.original.unit}`,
      }),
      column.accessor("responsibleName", { header: "Responsable" }),
    ],
    [],
  );

  const activeQuery =
    view === "balances"
      ? balancesQuery
      : view === "totals"
        ? totalsQuery
        : movementsQuery;
  const result = activeQuery.data;
  const items = result?.items || [];
  const pagination = result?.pagination;

  function submitSearch(event) {
    event.preventDefault();
    setPage(1);
    setSearch(query.trim());
  }

  function changeView(next) {
    setView(next);
    setPage(1);
  }

  if (!canRead && !canReadMovements) {
    return (
      <section className="page-section">
        <StateMessage tone="warning">
          No tienes permisos para consultar inventario o movimientos.
        </StateMessage>
      </section>
    );
  }

  return (
    <section className="page-section inventory-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Control de existencias</p>
          <h2>Inventario</h2>
          <p>
            Consulta saldos y trazabilidad únicamente en tus bodegas asignadas.
          </p>
        </div>
        <span className="inventory-heading-icon" aria-hidden="true">
          <Package size={22} />
        </span>
      </div>

      <div
        className="inventory-tabs"
        role="tablist"
        aria-label="Vistas de inventario"
      >
        {canRead ? (
          <button
            type="button"
            role="tab"
            aria-selected={view === "balances"}
            className={
              view === "balances" ? "inventory-tab is-active" : "inventory-tab"
            }
            onClick={() => changeView("balances")}
          >
            Por bodega
          </button>
        ) : null}
        {canRead ? (
          <button
            type="button"
            role="tab"
            aria-selected={view === "totals"}
            className={
              view === "totals" ? "inventory-tab is-active" : "inventory-tab"
            }
            onClick={() => changeView("totals")}
          >
            Totales autorizados
          </button>
        ) : null}
        {canReadMovements ? (
          <button
            type="button"
            role="tab"
            aria-selected={view === "movements"}
            className={
              view === "movements" ? "inventory-tab is-active" : "inventory-tab"
            }
            onClick={() => changeView("movements")}
          >
            <ArrowsLeftRight size={16} /> Movimientos
          </button>
        ) : null}
      </div>

      <div className="inventory-panel">
        <div className="inventory-toolbar">
          <form className="inventory-search" onSubmit={submitSearch}>
            <label className="sr-only" htmlFor="inventory-search">
              Buscar inventario
            </label>
            <MagnifyingGlass size={18} aria-hidden="true" />
            <Input
              id="inventory-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                view === "movements"
                  ? "Producto, referencia o motivo"
                  : "SKU o nombre del producto"
              }
            />
            <Button type="submit" size="sm">
              Buscar
            </Button>
          </form>
          <div className="inventory-filters">
            <label className="inventory-filter">
              Bodega
              <select
                value={warehouseId}
                onChange={(event) => {
                  setWarehouseId(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todas las asignadas</option>
                {(warehousesQuery.data?.items || []).map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                    {warehouse.isActive ? "" : " (inactiva)"}
                  </option>
                ))}
              </select>
            </label>
            {view !== "movements" ? (
              <label className="inventory-filter">
                Estado del saldo
                <select
                  value={stockStatus}
                  onChange={(event) => {
                    setStockStatus(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="all">Todos</option>
                  <option value="low">Stock bajo</option>
                  <option value="zero">Saldo en cero</option>
                  <option value="unregistered">Sin registrar</option>
                </select>
              </label>
            ) : null}
          </div>
        </div>

        {activeQuery.isError ? (
          <StateMessage tone="warning">
            {activeQuery.error instanceof ApiError &&
            activeQuery.error.status === 403
              ? "No tienes permiso para consultar esta información."
              : "No fue posible cargar la información. Intenta nuevamente."}
          </StateMessage>
        ) : (
          <DataTable
            columns={
              view === "balances"
                ? balanceColumns
                : view === "totals"
                  ? totalColumns
                  : movementColumns
            }
            data={items}
            page={page}
            pageSize={pageSize}
            total={pagination?.total || 0}
            sortBy="product"
            sortOrder="asc"
            onSortChange={() => {}}
            loading={activeQuery.isLoading}
            loadingLabel="Cargando inventario…"
            regionLabel={
              view === "movements"
                ? "Historial de movimientos"
                : "Existencias de inventario"
            }
            emptyState={
              <div>
                <strong>No hay registros para estos filtros.</strong>
                <p>
                  Los resultados solo incluyen bodegas asignadas y datos
                  existentes.
                </p>
              </div>
            }
          />
        )}

        <div className="inventory-pagination">
          <label>
            Filas por página
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
            >
              {pageSizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <span>{pagination ? `${pagination.total} registros` : " "}</span>
          <div>
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || activeQuery.isLoading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Anterior
            </Button>
            <span>
              Página {page}
              {pagination?.pageCount
                ? ` de ${Math.max(1, pagination.pageCount)}`
                : ""}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={
                !pagination ||
                page >= pagination.pageCount ||
                activeQuery.isLoading
              }
              onClick={() => setPage((current) => current + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
