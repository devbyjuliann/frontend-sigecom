import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { CaretDown } from "@phosphor-icons/react/CaretDown";
import { CaretUp } from "@phosphor-icons/react/CaretUp";

export default function DataTable({
  columns,
  data,
  page,
  pageSize,
  total,
  sortBy,
  sortOrder,
  onSortChange,
  loading = false,
  loadingLabel = "Cargando datos…",
  emptyState,
  emptyLabel = "No hay registros para mostrar.",
}) {
  // TanStack Table returns a mutable table controller by design; keep it out of React Compiler memoization.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    rowCount: total,
    state: {
      pagination: { pageIndex: page - 1, pageSize },
      sorting: [{ id: sortBy, desc: sortOrder === "desc" }],
    },
    onSortingChange: (updater) => {
      const current = [{ id: sortBy, desc: sortOrder === "desc" }];
      const next = typeof updater === "function" ? updater(current) : updater;
      if (next[0]) {
        onSortChange(next[0].id, next[0].desc ? "desc" : "asc");
      }
    },
  });

  if (loading) {
    return (
      <div className="table-state" role="status" aria-live="polite">
        <span className="table-skeleton" aria-hidden="true" />
        <span
          className="table-skeleton table-skeleton--short"
          aria-hidden="true"
        />
        {loadingLabel}
      </div>
    );
  }

  return (
    <>
      {data.length ? (
        <div
          className="data-table-scroll"
          role="region"
          aria-label="Categorías"
          tabIndex={0}
        >
          <p className="table-scroll-hint">
            Desliza la tabla para ver todas las columnas.
          </p>
          <table className="data-table">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={
                        header.column.getIsSorted() === "asc"
                          ? "ascending"
                          : header.column.getIsSorted() === "desc"
                            ? "descending"
                            : "none"
                      }
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-state table-state--empty" role="status">
          {emptyState || <p>{emptyLabel}</p>}
        </div>
      )}
    </>
  );
}

export function SortableHeading({ column, children }) {
  const sorted = column.getIsSorted();
  return (
    <button
      className="table-sort"
      type="button"
      onClick={column.getToggleSortingHandler()}
      aria-label={`Ordenar por ${children}`}
    >
      {children}
      {sorted === "asc" ? (
        <CaretUp size={15} aria-hidden="true" />
      ) : sorted === "desc" ? (
        <CaretDown size={15} aria-hidden="true" />
      ) : null}
    </button>
  );
}
