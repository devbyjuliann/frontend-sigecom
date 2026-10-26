import { useCallback, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { createColumnHelper } from "@tanstack/react-table";
import * as Dialog from "@radix-ui/react-dialog";
import { Check } from "@phosphor-icons/react/Check";
import { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { Plus } from "@phosphor-icons/react/Plus";
import { Power } from "@phosphor-icons/react/Power";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";
import DataTable, { SortableHeading } from "../components/data-table.jsx";
import { Button } from "../components/ui/button.jsx";
import { Input } from "../components/ui/input.jsx";
import { useAuth } from "../auth/auth-context.jsx";
import { ApiError, categoriesApi } from "../lib/auth-api.js";

const pageSizeOptions = [10, 25, 50];
const formSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Escribe el nombre de la categoría.")
    .max(120, "El nombre no puede superar 120 caracteres."),
  description: z
    .string()
    .trim()
    .max(255, "La descripción no puede superar 255 caracteres."),
});
const columnHelper = createColumnHelper();
const listQueryKey = ["categories", "list"];

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(new Date(value));
}

function queryNumber(value, fallback, maximum) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= maximum
    ? number
    : fallback;
}

export default function CategoriesPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session } = useAuth();
  const canManage = session.permissions.includes("categories.manage");
  const page = queryNumber(searchParams.get("page"), 1, 1_000_000);
  const pageSize = pageSizeOptions.includes(
    Number(searchParams.get("pageSize")),
  )
    ? Number(searchParams.get("pageSize"))
    : 10;
  const query = searchParams.get("q") || "";
  const status = ["active", "inactive"].includes(searchParams.get("status"))
    ? searchParams.get("status")
    : "all";
  const sortBy = ["name", "status", "updatedAt"].includes(
    searchParams.get("sortBy"),
  )
    ? searchParams.get("sortBy")
    : "name";
  const sortOrder = searchParams.get("sortOrder") === "desc" ? "desc" : "asc";
  const [searchInput, setSearchInput] = useState(query);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirming, setConfirming] = useState(null);

  const listQuery = useQuery({
    queryKey: [
      ...listQueryKey,
      { page, pageSize, q: query, status, sortBy, sortOrder },
    ],
    queryFn: () =>
      categoriesApi.list({
        page,
        pageSize,
        q: query,
        status,
        sortBy,
        sortOrder,
      }),
    retry: false,
  });

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", description: "" },
  });

  function updateSearchParams(changes) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value === "" || value === null || value === undefined)
        next.delete(key);
      else next.set(key, String(value));
    }
    setSearchParams(next, { replace: true });
  }

  function openCreate() {
    setEditing(null);
    form.reset({ name: "", description: "" });
    setFormOpen(true);
  }

  const openEdit = useCallback(
    (category) => {
      setEditing(category);
      form.reset({
        name: category.name,
        description: category.description || "",
      });
      setFormOpen(true);
    },
    [form],
  );

  const saveMutation = useMutation({
    mutationFn: (values) =>
      editing
        ? categoriesApi.update(editing.id, values)
        : categoriesApi.create(values),
    onSuccess: async () => {
      setFormOpen(false);
      toast.success(editing ? "Categoría actualizada." : "Categoría creada.");
      await queryClient.invalidateQueries({ queryKey: listQueryKey });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "CATEGORY_NAME_TAKEN") {
        form.setError("name", {
          message: "Ya existe una categoría con ese nombre.",
        });
        return;
      }
      toast.error(error.message || "No se pudo guardar la categoría.");
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ category, isActive }) =>
      categoriesApi.setStatus(category.id, isActive),
    onSuccess: async (_category, { isActive }) => {
      setConfirming(null);
      toast.success(
        isActive ? "Categoría activada." : "Categoría desactivada.",
      );
      await queryClient.invalidateQueries({ queryKey: listQueryKey });
    },
    onError: (error) =>
      toast.error(error.message || "No se pudo cambiar el estado."),
  });

  const columns = useMemo(() => {
    const base = [
      columnHelper.accessor("name", {
        header: ({ column }) => (
          <SortableHeading column={column}>Nombre</SortableHeading>
        ),
        cell: (info) => (
          <span className="table-primary-cell">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor("description", {
        header: "Descripción",
        cell: (info) => (
          <span className="table-secondary-cell">
            {info.getValue() || "Sin descripción"}
          </span>
        ),
        enableSorting: false,
      }),
      columnHelper.accessor("isActive", {
        id: "status",
        header: ({ column }) => (
          <SortableHeading column={column}>Estado</SortableHeading>
        ),
        cell: (info) => (
          <span
            className={`status-badge${info.getValue() ? " status-badge--active" : " status-badge--inactive"}`}
          >
            <span aria-hidden="true" />
            {info.getValue() ? "Activa" : "Inactiva"}
          </span>
        ),
      }),
      columnHelper.accessor("updatedAt", {
        header: ({ column }) => (
          <SortableHeading column={column}>
            Última actualización
          </SortableHeading>
        ),
        cell: (info) => (
          <span className="table-date">{formatDate(info.getValue())}</span>
        ),
      }),
    ];
    if (canManage) {
      base.push(
        columnHelper.display({
          id: "actions",
          header: "Acciones",
          cell: ({ row }) => (
            <div className="table-actions">
              <Button
                className="table-icon-button"
                variant="ghost"
                type="button"
                aria-label={`Editar ${row.original.name}`}
                onClick={() => openEdit(row.original)}
              >
                <PencilSimple size={17} aria-hidden="true" />
              </Button>
              <Button
                className="table-icon-button"
                variant="ghost"
                type="button"
                aria-label={`${row.original.isActive ? "Desactivar" : "Activar"} ${row.original.name}`}
                onClick={() => setConfirming(row.original)}
              >
                <Power size={17} aria-hidden="true" />
              </Button>
            </div>
          ),
        }),
      );
    }
    return base;
  }, [canManage, openEdit]);

  const result = listQuery.data;
  const pageCount = result?.pagination.pageCount || 0;
  const hasActiveFilters = Boolean(query) || status !== "all";

  function submitSearch(event) {
    event.preventDefault();
    updateSearchParams({ q: searchInput.trim(), page: null });
  }

  function submitForm(values) {
    saveMutation.mutate({
      name: values.name,
      description: values.description.trim() || null,
    });
  }

  return (
    <section className="categories-page" aria-labelledby="categories-title">
      <div className="module-heading">
        <div>
          <h2 id="categories-title">Categorías</h2>
          <p>Organiza los productos para facilitar su consulta.</p>
        </div>
        {canManage ? (
          <Button type="button" onClick={openCreate}>
            <Plus size={18} aria-hidden="true" /> Nueva categoría
          </Button>
        ) : null}
      </div>

      <section className="module-panel" aria-label="Listado de categorías">
        <form className="table-toolbar" onSubmit={submitSearch} role="search">
          <label className="table-search" htmlFor="category-search">
            <MagnifyingGlass size={18} aria-hidden="true" />
            <Input
              id="category-search"
              name="q"
              type="search"
              autoComplete="off"
              placeholder="Buscar por nombre o descripción…"
              aria-label="Buscar por nombre o descripción"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </label>
          <div className="table-toolbar__filters">
            <label className="filter-control" htmlFor="category-status-filter">
              <span>Estado</span>
              <select
                id="category-status-filter"
                value={status}
                onChange={(event) =>
                  updateSearchParams({ status: event.target.value, page: null })
                }
              >
                <option value="all">Todos</option>
                <option value="active">Activas</option>
                <option value="inactive">Inactivas</option>
              </select>
            </label>
            <label
              className="filter-control filter-control--page-size"
              htmlFor="category-page-size"
            >
              <span>Filas</span>
              <select
                id="category-page-size"
                value={pageSize}
                onChange={(event) =>
                  updateSearchParams({
                    pageSize: event.target.value,
                    page: null,
                  })
                }
              >
                {pageSizeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" variant="secondary" className="search-submit">
              Buscar
            </Button>
          </div>
        </form>

        {listQuery.isError ? (
          <div className="table-state table-state--error" role="alert">
            <h3>No se pudieron cargar las categorías</h3>
            <p>
              {listQuery.error.message ||
                "Comprueba la conexión con SIGECOM e inténtalo de nuevo."}
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => listQuery.refetch()}
            >
              Reintentar
            </Button>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={result?.items || []}
            regionLabel="Categorías"
            page={page}
            pageSize={pageSize}
            total={result?.pagination.total || 0}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={(nextSortBy, nextSortOrder) =>
              updateSearchParams({
                sortBy: nextSortBy,
                sortOrder: nextSortOrder,
                page: null,
              })
            }
            loading={listQuery.isPending}
            loadingLabel="Cargando categorías…"
            emptyLabel={
              hasActiveFilters
                ? "No hay categorías que coincidan con estos filtros."
                : "Aún no hay categorías"
            }
            emptyState={
              !hasActiveFilters && canManage ? (
                <div className="empty-content">
                  <h3>Aún no hay categorías</h3>
                  <p>
                    Crea una categoría para organizar el catálogo de productos.
                  </p>
                  <Button type="button" onClick={openCreate}>
                    <Plus size={17} aria-hidden="true" /> Crear categoría
                  </Button>
                </div>
              ) : undefined
            }
          />
        )}

        {result?.pagination.total > 0 ? (
          <div
            className="table-pagination"
            aria-label="Paginación de categorías"
          >
            <p>
              {result.pagination.total === 1
                ? "1 categoría"
                : `${result.pagination.total} categorías`}
              <span>
                {" "}
                · Página {page} de {Math.max(pageCount, 1)}
              </span>
            </p>
            <div>
              <Button
                type="button"
                variant="secondary"
                disabled={page <= 1 || listQuery.isFetching}
                onClick={() => updateSearchParams({ page: page - 1 })}
              >
                Anterior
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={
                  pageCount === 0 || page >= pageCount || listQuery.isFetching
                }
                onClick={() => updateSearchParams({ page: page + 1 })}
              >
                Siguiente
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <Dialog.Root
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) saveMutation.reset();
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="module-dialog-overlay" />
          <Dialog.Content
            className="module-dialog"
            aria-describedby="category-form-description"
          >
            <Dialog.Title className="module-dialog__title">
              {editing ? "Editar categoría" : "Nueva categoría"}
            </Dialog.Title>
            <Dialog.Description
              id="category-form-description"
              className="module-dialog__description"
            >
              Define un nombre claro para organizar los productos.
            </Dialog.Description>
            <form
              className="module-form"
              onSubmit={form.handleSubmit(submitForm)}
              noValidate
            >
              <div className="form-field">
                <label htmlFor="category-name">Nombre</label>
                <Input
                  id="category-name"
                  autoComplete="off"
                  maxLength={120}
                  aria-invalid={Boolean(form.formState.errors.name)}
                  aria-describedby={
                    form.formState.errors.name
                      ? "category-name-error"
                      : undefined
                  }
                  {...form.register("name")}
                />
                {form.formState.errors.name ? (
                  <span
                    className="field-error"
                    id="category-name-error"
                    aria-live="polite"
                  >
                    {form.formState.errors.name.message}
                  </span>
                ) : null}
              </div>
              <div className="form-field">
                <label htmlFor="category-description">
                  Descripción <span>(opcional)</span>
                </label>
                <textarea
                  className="module-textarea"
                  id="category-description"
                  autoComplete="off"
                  maxLength={255}
                  rows={3}
                  aria-invalid={Boolean(form.formState.errors.description)}
                  aria-describedby={
                    form.formState.errors.description
                      ? "category-description-error"
                      : undefined
                  }
                  {...form.register("description")}
                />
                {form.formState.errors.description ? (
                  <span
                    className="field-error"
                    id="category-description-error"
                    aria-live="polite"
                  >
                    {form.formState.errors.description.message}
                  </span>
                ) : null}
              </div>
              <div className="module-dialog__actions">
                <Dialog.Close asChild>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={saveMutation.isPending}
                  >
                    Cancelar
                  </Button>
                </Dialog.Close>
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? (
                    "Guardando…"
                  ) : editing ? (
                    <>
                      <Check size={17} aria-hidden="true" /> Guardar cambios
                    </>
                  ) : (
                    "Crear categoría"
                  )}
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={Boolean(confirming)}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="module-dialog-overlay" />
          <Dialog.Content
            className="module-dialog module-dialog--confirm"
            aria-describedby="category-status-description"
          >
            <Dialog.Title className="module-dialog__title">
              {confirming?.isActive
                ? "Desactivar categoría"
                : "Activar categoría"}
            </Dialog.Title>
            <Dialog.Description
              id="category-status-description"
              className="module-dialog__description"
            >
              {confirming?.isActive
                ? `“${confirming.name}” dejará de estar disponible para clasificar productos. No se eliminará su información.`
                : `“${confirming?.name}” volverá a estar disponible para clasificar productos.`}
            </Dialog.Description>
            <div className="module-dialog__actions">
              <Dialog.Close asChild>
                <Button type="button" variant="secondary">
                  Cancelar
                </Button>
              </Dialog.Close>
              <Button
                type="button"
                disabled={statusMutation.isPending}
                onClick={() =>
                  statusMutation.mutate({
                    category: confirming,
                    isActive: !confirming.isActive,
                  })
                }
              >
                {statusMutation.isPending
                  ? "Guardando…"
                  : confirming?.isActive
                    ? "Desactivar"
                    : "Activar"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
