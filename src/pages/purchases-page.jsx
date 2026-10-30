import { useMemo, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { CaretDown } from "@phosphor-icons/react/CaretDown";
import { CaretUp } from "@phosphor-icons/react/CaretUp";
import { FileText } from "@phosphor-icons/react/FileText";
import { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { Plus } from "@phosphor-icons/react/Plus";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/auth-context.jsx";
import DataTable, { SortableHeading } from "../components/data-table.jsx";
import { Button } from "../components/ui/button.jsx";
import { Input } from "../components/ui/input.jsx";
import { ApiError, purchasesApi, warehousesApi } from "../lib/auth-api.js";

const column = createColumnHelper();
function formatMoney(value) {
  const [whole, fractional = "00"] = String(value).split(".");
  return `$ ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${fractional.padEnd(2, "0").slice(0, 2)}`;
}
const date = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeZone: "America/Bogota",
});
const statuses = {
  draft: { label: "Borrador", tone: "draft" },
  confirmed: { label: "Confirmada", tone: "confirmed" },
  cancelled: { label: "Cancelada", tone: "cancelled" },
};

function pageValue(value, fallback, maximum) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= maximum
    ? number
    : fallback;
}

const quantityFormat = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 2,
});

function formatQuantity(value) {
  const quantity = Number(value);
  return Number.isFinite(quantity) ? quantityFormat.format(quantity) : "—";
}

function OrderProducts({ order }) {
  const lines = order.lines || [];

  return (
    <section
      className="purchase-expanded-order"
      id={`purchase-products-${order.id}`}
      aria-label={`Productos de la orden ${order.number}`}
    >
      <div className="purchase-expanded-heading">
        <h3>Productos de la orden</h3>
        <span>{lines.length} productos</span>
      </div>
      {lines.length ? (
        <table
          className="purchase-products-table"
          aria-label={`Productos de la orden ${order.number}`}
        >
          <thead>
            <tr>
              <th scope="col">SKU</th>
              <th scope="col">Producto</th>
              <th scope="col">Unidad</th>
              <th scope="col" className="purchase-quantity-cell">
                Cantidad pedida
              </th>
              <th scope="col" className="purchase-quantity-cell">
                Cantidad recibida
              </th>
              <th scope="col" className="purchase-quantity-cell">
                Cantidad pendiente
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}>
                <td data-label="SKU">{line.sku}</td>
                <td data-label="Producto" className="purchase-product-name">
                  {line.name}
                </td>
                <td data-label="Unidad">{line.unit}</td>
                <td
                  data-label="Cantidad pedida"
                  className="purchase-quantity-cell"
                >
                  {formatQuantity(line.quantity)}
                </td>
                <td
                  data-label="Cantidad recibida"
                  className="purchase-quantity-cell"
                >
                  {formatQuantity(line.receivedQuantity)}
                </td>
                <td
                  data-label="Cantidad pendiente"
                  className="purchase-quantity-cell purchase-pending-quantity"
                >
                  {formatQuantity(line.pendingQuantity)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="purchase-products-empty">
          Esta orden no tiene productos asociados.
        </p>
      )}
    </section>
  );
}

export default function PurchasesPage() {
  const { session } = useAuth();
  const canCreate = session.permissions.includes("purchases.create");
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") || "");
  const [expandedOrderIds, setExpandedOrderIds] = useState(() => new Set());
  const page = pageValue(params.get("page"), 1, 1_000_000);
  const pageSize = pageValue(params.get("pageSize"), 20, 100);
  const status = params.get("status") || "all";
  const warehouseId = params.get("warehouseId") || "";
  const dateFrom = params.get("dateFrom") || "";
  const dateTo = params.get("dateTo") || "";
  const sortBy = params.get("sortBy") || "date";
  const sortOrder = params.get("sortOrder") || "desc";
  const filters = useMemo(
    () => ({
      page,
      pageSize,
      q: params.get("q") || "",
      status,
      warehouseId,
      dateFrom,
      dateTo,
      sortBy,
      sortOrder,
    }),
    [
      page,
      pageSize,
      params,
      status,
      warehouseId,
      dateFrom,
      dateTo,
      sortBy,
      sortOrder,
    ],
  );
  const warehouses = useQuery({
    queryKey: ["purchase-order-warehouses"],
    queryFn: () =>
      warehousesApi.list({
        page: 1,
        pageSize: 100,
        status: "all",
        sortBy: "name",
        sortOrder: "asc",
      }),
    enabled: session.permissions.includes("warehouses.read"),
    retry: false,
  });
  const orders = useQuery({
    queryKey: ["purchase-orders", filters],
    queryFn: () => purchasesApi.list(filters),
    retry: false,
  });

  function change(key, value) {
    setParams((current) => {
      if (value) current.set(key, value);
      else current.delete(key);
      current.delete("page");
      return current;
    });
  }

  const columns = useMemo(
    () => [
      column.accessor("number", {
        header: ({ column: current }) => (
          <SortableHeading column={current}>Orden</SortableHeading>
        ),
        cell: ({ row }) => (
          <div className="purchase-order-cell">
            <Link
              className="purchase-order-link"
              to={`/compras/${row.original.id}`}
            >
              {row.original.number}
            </Link>
            <button
              className="purchase-order-expand"
              type="button"
              aria-expanded={expandedOrderIds.has(row.original.id)}
              aria-controls={
                expandedOrderIds.has(row.original.id)
                  ? `purchase-products-${row.original.id}`
                  : undefined
              }
              aria-label={`${expandedOrderIds.has(row.original.id) ? "Ocultar" : "Mostrar"} productos de la orden ${row.original.number}`}
              onClick={() =>
                setExpandedOrderIds((current) => {
                  const next = new Set(current);
                  if (next.has(row.original.id)) next.delete(row.original.id);
                  else next.add(row.original.id);
                  return next;
                })
              }
            >
              {expandedOrderIds.has(row.original.id) ? (
                <CaretUp size={15} aria-hidden="true" />
              ) : (
                <CaretDown size={15} aria-hidden="true" />
              )}
              <span>
                {expandedOrderIds.has(row.original.id)
                  ? "Ocultar"
                  : "Productos"}
              </span>
            </button>
          </div>
        ),
      }),
      column.accessor("orderDate", {
        id: "date",
        header: ({ column: current }) => (
          <SortableHeading column={current}>Fecha</SortableHeading>
        ),
        cell: ({ getValue }) =>
          date.format(new Date(`${getValue()}T12:00:00Z`)),
      }),
      column.accessor("supplierName", {
        id: "supplier",
        header: ({ column: current }) => (
          <SortableHeading column={current}>Proveedor</SortableHeading>
        ),
      }),
      column.accessor("warehouseName", {
        header: "Bodega destino",
      }),
      column.accessor("status", {
        header: ({ column: current }) => (
          <SortableHeading column={current}>Estado</SortableHeading>
        ),
        cell: ({ getValue }) => {
          const value = statuses[getValue()];
          return (
            <span className={`purchase-status purchase-status--${value.tone}`}>
              {value.label}
            </span>
          );
        },
      }),
      column.accessor("total", {
        header: "Total",
        cell: ({ getValue }) => formatMoney(getValue()),
      }),
    ],
    [expandedOrderIds],
  );

  return (
    <section className="page-section purchase-page">
      <header className="page-heading purchase-heading">
        <div>
          <p className="page-kicker">Abastecimiento</p>
          <h1>Órdenes de compra</h1>
          <p>Consulta y administra los pedidos realizados a tus proveedores.</p>
        </div>
        {canCreate ? (
          <Button asChild className="purchase-create-button">
            <Link to="/compras/nueva">
              <Plus size={18} aria-hidden="true" />
              Nueva orden
            </Link>
          </Button>
        ) : null}
      </header>

      <section className="purchase-list-panel" aria-label="Órdenes registradas">
        <div className="purchase-toolbar">
          <form
            className="purchase-search"
            onSubmit={(event) => {
              event.preventDefault();
              change("q", query.trim());
            }}
          >
            <label className="sr-only" htmlFor="purchase-search">
              Buscar órdenes
            </label>
            <MagnifyingGlass size={18} aria-hidden="true" />
            <Input
              id="purchase-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Número, proveedor o referencia"
            />
            <Button type="submit" variant="secondary" size="sm">
              Buscar
            </Button>
          </form>
          <label className="purchase-status-filter">
            Estado
            <select
              value={status}
              onChange={(event) =>
                change(
                  "status",
                  event.target.value === "all" ? "" : event.target.value,
                )
              }
            >
              <option value="all">Todos</option>
              <option value="draft">Borrador</option>
              <option value="confirmed">Confirmada</option>
              <option value="cancelled">Cancelada</option>
            </select>
          </label>
          {session.permissions.includes("warehouses.read") ? (
            <label className="purchase-status-filter">
              Bodega
              <select
                value={warehouseId}
                onChange={(event) => change("warehouseId", event.target.value)}
              >
                <option value="">Todas las asignadas</option>
                {(warehouses.data?.items || []).map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                    {warehouse.isActive ? "" : " (inactiva)"}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="purchase-status-filter">
            Desde
            <Input
              aria-label="Fecha desde"
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(event) => change("dateFrom", event.target.value)}
            />
          </label>
          <label className="purchase-status-filter">
            Hasta
            <Input
              aria-label="Fecha hasta"
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(event) => change("dateTo", event.target.value)}
            />
          </label>
        </div>

        {orders.isError ? (
          <div className="purchase-state purchase-state--error" role="alert">
            <FileText size={24} aria-hidden="true" />
            <h2>No se pudieron cargar las órdenes</h2>
            <p>
              {orders.error instanceof ApiError
                ? orders.error.message
                : "Comprueba la conexión e inténtalo de nuevo."}
            </p>
            <Button variant="secondary" onClick={() => orders.refetch()}>
              Reintentar
            </Button>
          </div>
        ) : orders.isPending ? (
          <div className="purchase-state" role="status">
            Cargando órdenes de compra…
          </div>
        ) : orders.data.items.length === 0 ? (
          <div className="purchase-state purchase-state--empty">
            <FileText size={28} aria-hidden="true" />
            <h2>
              {filters.q ||
              status !== "all" ||
              warehouseId ||
              dateFrom ||
              dateTo
                ? "No hay órdenes para estos filtros"
                : "Aún no hay órdenes de compra"}
            </h2>
            <p>
              {canCreate
                ? "Crea un borrador para organizar tu próximo pedido."
                : "Las órdenes autorizadas aparecerán aquí."}
            </p>
            {canCreate &&
            !filters.q &&
            status === "all" &&
            !warehouseId &&
            !dateFrom &&
            !dateTo ? (
              <Button asChild variant="secondary">
                <Link to="/compras/nueva">Crear primera orden</Link>
              </Button>
            ) : null}
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={orders.data.items}
            page={orders.data.pagination.page}
            pageSize={orders.data.pagination.pageSize}
            total={orders.data.pagination.total}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={(id, order) => {
              setParams((current) => {
                current.set("sortBy", id);
                current.set("sortOrder", order);
                return current;
              });
            }}
            loading={orders.isFetching}
            emptyLabel="No hay órdenes para estos filtros."
            regionLabel="Órdenes de compra"
            expandedRowIds={expandedOrderIds}
            renderExpandedRow={(order) => <OrderProducts order={order} />}
          />
        )}
        {!orders.isError &&
        !orders.isPending &&
        orders.data.pagination.total > 0 ? (
          <div
            className="purchase-pagination"
            aria-label="Paginación de órdenes"
          >
            <label>
              Filas por página
              <select
                value={pageSize}
                onChange={(event) =>
                  setParams((current) => {
                    current.set("pageSize", event.target.value);
                    current.delete("page");
                    return current;
                  })
                }
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </label>
            <span>
              Página {orders.data.pagination.page} de{" "}
              {orders.data.pagination.pageCount} ·{" "}
              {orders.data.pagination.total} órdenes
            </span>
            <div>
              <Button
                size="sm"
                variant="secondary"
                disabled={page <= 1}
                onClick={() =>
                  setParams((current) => {
                    current.set("page", String(page - 1));
                    return current;
                  })
                }
              >
                Anterior
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={page >= orders.data.pagination.pageCount}
                onClick={() =>
                  setParams((current) => {
                    current.set("page", String(page + 1));
                    return current;
                  })
                }
              >
                Siguiente
              </Button>
            </div>
          </div>
        ) : null}
      </section>
    </section>
  );
}
