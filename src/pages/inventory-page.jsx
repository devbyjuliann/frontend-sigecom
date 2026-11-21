import { useMemo, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { Package } from "@phosphor-icons/react/Package";
import { ArrowsLeftRight } from "@phosphor-icons/react/ArrowsLeftRight";
import DataTable from "../components/data-table.jsx";
import { Button } from "../components/ui/button.jsx";
import { Input } from "../components/ui/input.jsx";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/auth-context.jsx";
import { fetchWarehouseOptions } from "../lib/warehouse-options.js";
import {
  ApiError,
  categoriesApi,
  inventoryApi,
  warehousesApi,
} from "../lib/auth-api.js";

const column = createColumnHelper();
const pageSizes = [10, 25, 50];
const operationLabels = {
  initial_stock: "Apertura de inventario",
  adjustment_in: "Ajuste de entrada",
  adjustment_out: "Ajuste de salida",
  transfer: "Traslado",
  purchase_receipt: "Recepción de compra",
  sale_issue: "Salida por venta",
  sale_reversal: "Anulación de venta",
  customer_return: "Devolución de cliente",
  supplier_return: "Devolución a proveedor",
};
const quantityFormatter = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 0,
});
const operationTypes = Object.entries(operationLabels);

function formatQuantity(value) {
  return quantityFormatter.format(Number(value) || 0);
}

function ProductStatusBadge({ isActive }) {
  return (
    <span
      className={`status-badge${isActive ? "" : " status-badge--inactive"}`}
    >
      <span aria-hidden="true" />
      {isActive ? "Activo" : "Inactivo"}
    </span>
  );
}

function StockStatusBadge({ item }) {
  if (!item.hasBalance) {
    return (
      <span className="status-badge status-badge--muted">
        Sin saldo registrado
      </span>
    );
  }
  if (Number(item.quantity) === 0) {
    return <span className="status-badge status-badge--danger">Agotado</span>;
  }
  if (item.isLowStock) {
    return (
      <span className="status-badge status-badge--warning">Stock bajo</span>
    );
  }
  return <span className="status-badge">Disponible</span>;
}

function TotalStockStatusBadge({ item }) {
  if (!item.hasRegisteredBalances) {
    return (
      <span className="status-badge status-badge--muted">
        Sin saldos registrados
      </span>
    );
  }
  if (Number(item.totalQuantity) === 0) {
    return <span className="status-badge status-badge--danger">Agotado</span>;
  }
  if (Number(item.lowStockWarehouseCount) > 0) {
    return (
      <span className="status-badge status-badge--warning">Stock bajo</span>
    );
  }
  return <span className="status-badge">Disponible</span>;
}

function formatInventoryDate(value) {
  if (!value) return "—";
  const source = value instanceof Date ? value.toISOString() : value;
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(source);
  const date = new Date(hasTimezone ? source : `${source.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(date);
}

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
  const [searchParams, setSearchParams] = useSearchParams();
  const canRead = session.permissions.includes("inventory.read");
  const canReadMovements = session.permissions.includes(
    "inventory.movements.read",
  );
  const [view, setView] = useState(canRead ? "balances" : "movements");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [productStatus, setProductStatus] = useState("active");
  const [stockStatus, setStockStatus] = useState("all");
  const warehouseId = searchParams.get("warehouseId") || "";
  const [operationType, setOperationType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  function changeWarehouseId(value) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set("warehouseId", value);
    else next.delete("warehouseId");
    setSearchParams(next, { replace: true });
    setPage(1);
  }

  const filters = useMemo(
    () => ({
      page,
      pageSize,
      q: search,
      categoryId,
      productStatus,
      warehouseStatus: "all",
      stockStatus,
      warehouseId,
    }),
    [
      page,
      pageSize,
      search,
      categoryId,
      productStatus,
      stockStatus,
      warehouseId,
    ],
  );
  const movementFilters = useMemo(
    () => ({
      page,
      pageSize,
      q: search,
      warehouseId,
      operationType,
      dateFrom,
      dateTo,
    }),
    [page, pageSize, search, warehouseId, operationType, dateFrom, dateTo],
  );
  const warehousesQuery = useQuery({
    queryKey: ["inventory", "warehouse-filters"],
    queryFn: () => fetchWarehouseOptions(warehousesApi.list, { status: "all" }),
    enabled:
      (canRead || canReadMovements) &&
      session.permissions.includes("warehouses.read"),
    retry: false,
  });
  const categoriesQuery = useQuery({
    queryKey: ["inventory", "category-filters"],
    queryFn: () =>
      categoriesApi.list({ page: 1, pageSize: 100, status: "all" }),
    enabled: canRead && session.permissions.includes("categories.read"),
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
    queryKey: ["inventory", "movements", movementFilters],
    queryFn: () => inventoryApi.movements(movementFilters),
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
            ? `${formatQuantity(row.original.quantity)} ${row.original.unit}`
            : "Sin saldo registrado",
      }),
      column.display({
        id: "productStatus",
        header: "Estado del producto",
        cell: ({ row }) => (
          <ProductStatusBadge isActive={row.original.productIsActive} />
        ),
      }),
      column.accessor("minimumStock", {
        header: "Mínimo por bodega",
        cell: ({ getValue }) => formatQuantity(getValue()),
      }),
      column.display({
        id: "stockStatus",
        header: "Estado de existencias",
        cell: ({ row }) => <StockStatusBadge item={row.original} />,
      }),
    ],
    [],
  );
  const totalColumns = useMemo(
    () => [
      column.accessor("sku", { header: "SKU" }),
      column.accessor("productName", { header: "Producto" }),
      column.display({
        id: "productStatus",
        header: "Estado del producto",
        cell: ({ row }) => (
          <ProductStatusBadge isActive={row.original.productIsActive} />
        ),
      }),
      column.display({
        id: "stockStatus",
        header: "Estado de existencias",
        cell: ({ row }) => <TotalStockStatusBadge item={row.original} />,
      }),
      column.accessor("authorizedWarehouseCount", {
        header: "Bodegas autorizadas",
      }),
      column.accessor("registeredBalanceCount", {
        header: "Saldos registrados",
      }),
      column.accessor("totalQuantity", {
        header: "Total autorizado",
        cell: ({ row }) =>
          `${formatQuantity(row.original.totalQuantity)} ${row.original.unit}`,
      }),
      column.accessor("lowStockWarehouseCount", {
        header: "Bodegas con alerta",
      }),
      column.accessor("zeroBalanceCount", { header: "Bodegas en cero" }),
    ],
    [],
  );
  const movementColumns = useMemo(
    () => [
      column.accessor("createdAt", {
        header: "Fecha",
        cell: ({ getValue }) => formatInventoryDate(getValue()),
      }),
      column.accessor("sku", { header: "SKU" }),
      column.accessor("productName", { header: "Producto" }),
      column.accessor("warehouseName", { header: "Bodega" }),
      column.accessor("operationType", {
        header: "Operación",
        cell: ({ getValue }) =>
          operationLabels[getValue()] || "Operación de inventario",
      }),
      column.accessor("direction", {
        header: "Tipo",
        cell: ({ getValue }) => (getValue() === "IN" ? "Entrada" : "Salida"),
      }),
      column.accessor("quantity", {
        header: "Cantidad",
        cell: ({ row }) =>
          `${formatQuantity(row.original.quantity)} ${row.original.unit}`,
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

  function changeFilter(setter) {
    return (event) => {
      setter(event.target.value);
      setPage(1);
    };
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
        onKeyDown={(event) => {
          const tabs = [
            ...event.currentTarget.querySelectorAll('[role="tab"]'),
          ];
          const currentIndex = tabs.indexOf(document.activeElement);
          let nextIndex;
          if (event.key === "ArrowRight")
            nextIndex = (currentIndex + 1) % tabs.length;
          else if (event.key === "ArrowLeft")
            nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
          else if (event.key === "Home") nextIndex = 0;
          else if (event.key === "End") nextIndex = tabs.length - 1;
          if (nextIndex !== undefined) {
            event.preventDefault();
            tabs[nextIndex].focus();
            tabs[nextIndex].click();
          }
        }}
      >
        {canRead ? (
          <button
            type="button"
            role="tab"
            id="inventory-tab-balances"
            aria-controls="inventory-tabpanel"
            aria-selected={view === "balances"}
            tabIndex={view === "balances" ? 0 : -1}
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
            id="inventory-tab-totals"
            aria-controls="inventory-tabpanel"
            aria-selected={view === "totals"}
            tabIndex={view === "totals" ? 0 : -1}
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
            id="inventory-tab-movements"
            aria-controls="inventory-tabpanel"
            aria-selected={view === "movements"}
            tabIndex={view === "movements" ? 0 : -1}
            className={
              view === "movements" ? "inventory-tab is-active" : "inventory-tab"
            }
            onClick={() => changeView("movements")}
          >
            <ArrowsLeftRight size={16} /> Movimientos
          </button>
        ) : null}
      </div>

      <div
        className="inventory-panel"
        id="inventory-tabpanel"
        role="tabpanel"
        aria-labelledby={`inventory-tab-${view}`}
        tabIndex={0}
      >
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
                  : "Buscar por SKU o nombre"
              }
            />
            <Button type="submit" size="sm">
              Buscar
            </Button>
          </form>
          <div className="inventory-filters">
            {canRead && !session.permissions.includes("warehouses.read") ? (
              <span className="inventory-filter-note">
                Solo se muestran existencias de tus bodegas autorizadas.
              </span>
            ) : null}
            {(canRead || canReadMovements) &&
            session.permissions.includes("warehouses.read") ? (
              <div className="inventory-filter">
                <label htmlFor="inventory-warehouse-filter">Bodega</label>
                <select
                  id="inventory-warehouse-filter"
                  value={warehouseId}
                  disabled={
                    warehousesQuery.isPending || warehousesQuery.isError
                  }
                  onChange={(event) => changeWarehouseId(event.target.value)}
                >
                  <option value="">
                    {warehousesQuery.isPending
                      ? "Cargando bodegas…"
                      : warehousesQuery.isError
                        ? "No se pudieron cargar las bodegas"
                        : "Todas las asignadas"}
                  </option>
                  {(warehousesQuery.data || []).map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                      {warehouse.isActive ? "" : " (inactiva)"}
                    </option>
                  ))}
                </select>
                {warehousesQuery.isError ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => warehousesQuery.refetch()}
                  >
                    Reintentar bodegas
                  </Button>
                ) : null}
              </div>
            ) : null}
            {view !== "movements" && canRead ? (
              <>
                {session.permissions.includes("categories.read") ? (
                  <label className="inventory-filter">
                    Categoría
                    <select
                      value={categoryId}
                      onChange={changeFilter(setCategoryId)}
                    >
                      <option value="">Todas las categorías</option>
                      {(categoriesQuery.data?.items || []).map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                          {category.isActive ? "" : " (inactiva)"}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label className="inventory-filter">
                  Estado del producto
                  <select
                    value={productStatus}
                    onChange={changeFilter(setProductStatus)}
                  >
                    <option value="all">Activos e inactivos</option>
                    <option value="active">Activos</option>
                    <option value="inactive">Inactivos</option>
                  </select>
                </label>
                <label className="inventory-filter">
                  Estado de existencias
                  <select
                    value={stockStatus}
                    onChange={changeFilter(setStockStatus)}
                  >
                    <option value="all">Todos los estados</option>
                    <option value="low">Bajo el mínimo (incluye cero)</option>
                    <option value="zero">Saldo registrado en cero</option>
                    <option value="unregistered">Sin saldo registrado</option>
                  </select>
                </label>
              </>
            ) : null}
            {view === "movements" ? (
              <>
                <label className="inventory-filter">
                  Tipo de movimiento
                  <select
                    value={operationType}
                    onChange={changeFilter(setOperationType)}
                  >
                    <option value="">Todos los tipos</option>
                    {operationTypes.map(([type, label]) => (
                      <option key={type} value={type}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="inventory-filter">
                  Fecha desde
                  <Input
                    type="date"
                    value={dateFrom}
                    max={dateTo || undefined}
                    onChange={changeFilter(setDateFrom)}
                  />
                </label>
                <label className="inventory-filter">
                  Fecha hasta
                  <Input
                    type="date"
                    value={dateTo}
                    min={dateFrom || undefined}
                    onChange={changeFilter(setDateTo)}
                  />
                </label>
              </>
            ) : null}
          </div>
        </div>

        {view === "totals" ? (
          <p className="inventory-scope-note">
            Totales por producto y unidad de medida, únicamente en bodegas
            asignadas y autorizadas. Los filtros de existencias coinciden si el
            estado aparece en al menos una de esas bodegas.
          </p>
        ) : null}

        {categoriesQuery.isError && canRead ? (
          <StateMessage tone="warning">
            No fue posible cargar las categorías; puedes continuar con los demás
            filtros.
          </StateMessage>
        ) : null}

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

        {warehousesQuery.isError &&
        (canRead || canReadMovements) &&
        session.permissions.includes("warehouses.read") ? (
          <StateMessage tone="warning">
            No fue posible cargar las bodegas autorizadas para el filtro.
          </StateMessage>
        ) : null}

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
