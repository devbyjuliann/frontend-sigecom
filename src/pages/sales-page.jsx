import { useMemo, useState } from "react";
import { FileText } from "@phosphor-icons/react/FileText";
import { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { Plus } from "@phosphor-icons/react/Plus";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/auth-context.jsx";
import { Button } from "../components/ui/button.jsx";
import { Input } from "../components/ui/input.jsx";
import { salesApi, warehousesApi } from "../lib/auth-api.js";

function formatMoney(value) {
  const [whole, fractional = "00"] = String(value).split(".");
  return `$ ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${fractional.padEnd(2, "0").slice(0, 2)}`;
}
const date = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeZone: "America/Bogota",
});
const status = {
  draft: "Borrador",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
};
const sortable = [
  ["number", "Código"],
  ["date", "Fecha"],
  ["customer", "Cliente"],
  ["warehouse", "Bodega"],
  ["status", "Estado"],
  ["total", "Total"],
];

function pageFrom(value, fallback = 1) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 ? number : fallback;
}

export default function SalesPage() {
  const { session } = useAuth();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("q") || "");
  const page = pageFrom(params.get("page"));
  const pageSize = pageFrom(params.get("pageSize"), 20);
  const filters = useMemo(
    () => ({
      page,
      pageSize,
      q: params.get("q") || "",
      customerId: params.get("customerId") || "",
      status: params.get("status") || "all",
      warehouseId: params.get("warehouseId") || "",
      dateFrom: params.get("dateFrom") || "",
      dateTo: params.get("dateTo") || "",
      sortBy: params.get("sortBy") || "date",
      sortOrder: params.get("sortOrder") || "desc",
    }),
    [page, pageSize, params],
  );
  const sales = useQuery({
    queryKey: ["sales", filters],
    queryFn: () => salesApi.list(filters),
    retry: false,
  });
  const warehouses = useQuery({
    queryKey: ["sales-filter-warehouses"],
    queryFn: () =>
      warehousesApi.list({
        page: 1,
        pageSize: 100,
        status: "all",
        sortBy: "name",
        sortOrder: "asc",
      }),
    retry: false,
  });
  const canCreate = session.permissions.includes("sales.create");

  function updateFilters(values) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!("page" in values)) next.set("page", "1");
    setParams(next);
  }

  function sortBy(key) {
    updateFilters({
      sortBy: key,
      sortOrder:
        filters.sortBy === key && filters.sortOrder === "asc" ? "desc" : "asc",
    });
  }

  return (
    <section className="page-section purchase-page">
      <header className="page-heading purchase-heading">
        <div>
          <p className="page-kicker">Gestión comercial</p>
          <h1>Ventas</h1>
          <p>
            Consulta y prepara borradores comerciales sin reservar existencias.
          </p>
        </div>
        {canCreate ? (
          <Button asChild className="purchase-create-button">
            <Link to="/ventas/nueva">
              <Plus size={18} aria-hidden="true" /> Nueva venta
            </Link>
          </Button>
        ) : null}
      </header>

      <section className="purchase-list-panel" aria-label="Listado de ventas">
        {filters.customerId ? (
          <p className="purchase-context-filter" role="status">
            Filtrando por cliente #{filters.customerId}
            <Button
              type="button"
              variant="ghost"
              onClick={() => updateFilters({ customerId: "" })}
            >
              Quitar filtro de cliente
            </Button>
          </p>
        ) : null}
        <div className="purchase-toolbar">
          <form
            className="purchase-search"
            onSubmit={(event) => {
              event.preventDefault();
              updateFilters({ q: search.trim() });
            }}
          >
            <MagnifyingGlass size={17} aria-hidden="true" />
            <Input
              aria-label="Buscar ventas"
              placeholder="Buscar por código o cliente"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button type="submit" variant="secondary">
              Buscar
            </Button>
          </form>
          <label className="purchase-status-filter">
            Estado
            <select
              aria-label="Filtrar por estado"
              value={filters.status}
              onChange={(event) =>
                updateFilters({ status: event.target.value })
              }
            >
              <option value="all">Todos</option>
              <option value="draft">Borradores</option>
              <option value="confirmed">Confirmadas</option>
              <option value="cancelled">Canceladas</option>
            </select>
          </label>
          <label className="purchase-status-filter">
            Bodega
            <select
              aria-label="Filtrar por bodega"
              value={filters.warehouseId}
              onChange={(event) =>
                updateFilters({ warehouseId: event.target.value })
              }
            >
              <option value="">Todas las autorizadas</option>
              {(warehouses.data?.items || []).map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </select>
          </label>
          <label className="purchase-status-filter">
            Desde
            <input
              aria-label="Fecha desde"
              type="date"
              value={filters.dateFrom}
              onChange={(event) =>
                updateFilters({ dateFrom: event.target.value })
              }
            />
          </label>
          <label className="purchase-status-filter">
            Hasta
            <input
              aria-label="Fecha hasta"
              type="date"
              value={filters.dateTo}
              onChange={(event) =>
                updateFilters({ dateTo: event.target.value })
              }
            />
          </label>
        </div>
        {sales.isError ? (
          <div className="purchase-state purchase-state--error" role="alert">
            <h2>No se pudieron cargar las ventas</h2>
            <p>{sales.error.message}</p>
            <Button variant="secondary" onClick={() => sales.refetch()}>
              Reintentar
            </Button>
          </div>
        ) : null}
        {sales.isPending ? (
          <div className="purchase-state" role="status">
            Cargando ventas…
          </div>
        ) : null}
        {!sales.isPending && !sales.isError && !sales.data?.items?.length ? (
          <div className="purchase-state">
            <FileText size={26} aria-hidden="true" />
            <h2>No hay ventas para mostrar</h2>
            <p>
              {filters.q || filters.status !== "all"
                ? "Prueba ajustando los filtros."
                : "Cuando se creen borradores, aparecerán aquí."}
            </p>
            {canCreate ? (
              <Button asChild variant="secondary">
                <Link to="/ventas/nueva">Crear primer borrador</Link>
              </Button>
            ) : null}
          </div>
        ) : null}
        {sales.data?.items?.length ? (
          <div className="purchase-table-wrap">
            <table className="purchase-products-table sales-table">
              <thead>
                <tr>
                  {sortable.map(([key, label]) => (
                    <th key={key}>
                      <button
                        type="button"
                        className="sales-sort"
                        onClick={() => sortBy(key)}
                      >
                        {label}
                        {filters.sortBy === key ? (
                          <span
                            aria-label={
                              filters.sortOrder === "asc"
                                ? "ascendente"
                                : "descendente"
                            }
                          >
                            {filters.sortOrder === "asc" ? " ↑" : " ↓"}
                          </span>
                        ) : null}
                      </button>
                    </th>
                  ))}
                  <th>
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sales.data.items.map((sale) => (
                  <tr key={sale.id}>
                    <td data-label="Código">
                      <Link
                        className="purchase-order-link"
                        to={`/ventas/${sale.id}`}
                      >
                        {sale.number}
                      </Link>
                    </td>
                    <td data-label="Fecha">
                      {date.format(new Date(`${sale.saleDate}T12:00:00-05:00`))}
                    </td>
                    <td data-label="Cliente">{sale.customerName}</td>
                    <td data-label="Bodega">
                      {sale.warehouseName}
                      {!sale.warehouseIsActive ? (
                        <small className="block text-muted">(inactiva)</small>
                      ) : null}
                    </td>
                    <td data-label="Estado">
                      <span
                        className={`purchase-status purchase-status--${sale.status}`}
                      >
                        {status[sale.status] || sale.status}
                      </span>
                    </td>
                    <td data-label="Total" className="sales-total">
                      {formatMoney(sale.total)}
                    </td>
                    <td data-label="Detalle">
                      <Link
                        className="sales-detail-link"
                        to={`/ventas/${sale.id}`}
                      >
                        Ver detalle
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {sales.data?.pagination ? (
          <div className="purchase-pagination">
            <span>
              {sales.data.pagination.total} ventas · página {page} de{" "}
              {Math.max(1, sales.data.pagination.pageCount)}
            </span>
            <div>
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => updateFilters({ page: String(page - 1) })}
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={page >= sales.data.pagination.pageCount}
                onClick={() => updateFilters({ page: String(page + 1) })}
              >
                Siguiente
              </button>
            </div>
            <label>
              Filas
              <select
                aria-label="Filas por página"
                value={pageSize}
                onChange={(event) =>
                  updateFilters({ pageSize: event.target.value })
                }
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
              </select>
            </label>
          </div>
        ) : null}
      </section>
    </section>
  );
}
