import { useCallback, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { createColumnHelper } from "@tanstack/react-table";
import * as Dialog from "@radix-ui/react-dialog";
import { Check } from "@phosphor-icons/react/Check";
import { Eye } from "@phosphor-icons/react/Eye";
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
import { ApiError, warehousesApi } from "../lib/auth-api.js";

const pageSizeOptions = [10, 25, 50];
const formSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Escribe el código de la bodega.")
    .max(40, "El código no puede superar 40 caracteres.")
    .regex(
      /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/,
      "Usa letras, números, guiones o guiones bajos.",
    ),
  name: z
    .string()
    .trim()
    .min(1, "Escribe el nombre de la bodega.")
    .max(120, "El nombre no puede superar 120 caracteres."),
  location: z
    .string()
    .trim()
    .max(255, "La ubicación no puede superar 255 caracteres."),
  responsibleUserId: z.string(),
});
const columnHelper = createColumnHelper();
const listQueryKey = ["warehouses", "list"];

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

export default function WarehousesPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session } = useAuth();
  const canManage =
    session.user.role === "administrator" &&
    session.permissions.includes("warehouses.manage");
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
  const sortBy = [
    "code",
    "name",
    "location",
    "status",
    "responsible",
    "updatedAt",
  ].includes(searchParams.get("sortBy"))
    ? searchParams.get("sortBy")
    : "name";
  const sortOrder = searchParams.get("sortOrder") === "desc" ? "desc" : "asc";
  const [searchInput, setSearchInput] = useState(query);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [detailsId, setDetailsId] = useState(null);

  const listQuery = useQuery({
    queryKey: [
      ...listQueryKey,
      { page, pageSize, q: query, status, sortBy, sortOrder },
    ],
    queryFn: () =>
      warehousesApi.list({
        page,
        pageSize,
        q: query,
        status,
        sortBy,
        sortOrder,
      }),
    retry: false,
  });
  const responsibleQuery = useQuery({
    queryKey: ["warehouses", "responsibles"],
    queryFn: () => warehousesApi.responsibles(),
    enabled: formOpen && canManage,
    retry: false,
  });
  const detailsQuery = useQuery({
    queryKey: ["warehouses", "detail", detailsId],
    queryFn: () => warehousesApi.get(detailsId),
    enabled: Boolean(detailsId),
    retry: false,
  });

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: { code: "", name: "", location: "", responsibleUserId: "" },
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
    form.reset({ code: "", name: "", location: "", responsibleUserId: "" });
    setFormOpen(true);
  }

  const openEdit = useCallback(
    (warehouse) => {
      setEditing(warehouse);
      form.reset({
        code: warehouse.code,
        name: warehouse.name,
        location: warehouse.location || "",
        responsibleUserId: warehouse.responsibleUserId || "",
      });
      setFormOpen(true);
    },
    [form],
  );

  const saveMutation = useMutation({
    mutationFn: (values) => {
      const input = {
        code: values.code.trim().toUpperCase(),
        name: values.name.trim(),
        location: values.location.trim() || null,
        responsibleUserId: values.responsibleUserId || null,
      };
      return editing
        ? warehousesApi.update(editing.id, input)
        : warehousesApi.create(input);
    },
    onSuccess: async () => {
      setFormOpen(false);
      toast.success(editing ? "Bodega actualizada." : "Bodega creada.");
      await queryClient.invalidateQueries({ queryKey: ["warehouses"] });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "WAREHOUSE_CODE_TAKEN") {
        form.setError("code", {
          message: "Ya existe una bodega con ese código.",
        });
        return;
      }
      if (
        error instanceof ApiError &&
        error.code === "INVALID_RESPONSIBLE_USER"
      ) {
        form.setError("responsibleUserId", {
          message: "El responsable ya no está activo. Selecciona otro usuario.",
        });
        return;
      }
      toast.error(error.message || "No se pudo guardar la bodega.");
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ warehouse, isActive }) =>
      warehousesApi.setStatus(warehouse.id, isActive),
    onSuccess: async (_warehouse, { isActive }) => {
      setConfirming(null);
      toast.success(isActive ? "Bodega activada." : "Bodega desactivada.");
      await queryClient.invalidateQueries({ queryKey: ["warehouses"] });
    },
    onError: (error) =>
      toast.error(error.message || "No se pudo cambiar el estado."),
  });

  const columns = useMemo(() => {
    const base = [
      columnHelper.accessor("code", {
        header: ({ column }) => (
          <SortableHeading column={column}>Código</SortableHeading>
        ),
        cell: (info) => (
          <span className="table-primary-cell warehouse-code">
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor("name", {
        header: ({ column }) => (
          <SortableHeading column={column}>Nombre</SortableHeading>
        ),
      }),
      columnHelper.accessor("location", {
        header: ({ column }) => (
          <SortableHeading column={column}>Ubicación</SortableHeading>
        ),
        cell: (info) => (
          <span className="table-secondary-cell">
            {info.getValue() || "Sin ubicación"}
          </span>
        ),
      }),
      columnHelper.accessor("responsibleName", {
        id: "responsible",
        header: ({ column }) => (
          <SortableHeading column={column}>Responsable</SortableHeading>
        ),
        cell: (info) => (
          <span className="table-secondary-cell">
            {info.getValue() || "Sin asignar"}
          </span>
        ),
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
          <SortableHeading column={column}>Actualización</SortableHeading>
        ),
        cell: (info) => (
          <span className="table-date">{formatDate(info.getValue())}</span>
        ),
      }),
    ];
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
              aria-label={`Ver bodega ${row.original.code}`}
              onClick={() => setDetailsId(row.original.id)}
            >
              <Eye size={17} aria-hidden="true" />
            </Button>
            {canManage ? (
              <>
                <Button
                  className="table-icon-button"
                  variant="ghost"
                  type="button"
                  aria-label={`Editar bodega ${row.original.code}`}
                  onClick={() => openEdit(row.original)}
                >
                  <PencilSimple size={17} aria-hidden="true" />
                </Button>
                <Button
                  className="table-icon-button"
                  variant="ghost"
                  type="button"
                  aria-label={`${row.original.isActive ? "Desactivar" : "Activar"} bodega ${row.original.code}`}
                  onClick={() => setConfirming(row.original)}
                >
                  <Power size={17} aria-hidden="true" />
                </Button>
              </>
            ) : null}
          </div>
        ),
      }),
    );
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
    saveMutation.mutate(values);
  }

  return (
    <section className="categories-page" aria-labelledby="warehouses-title">
      <div className="module-heading">
        <div>
          <h2 id="warehouses-title">Bodegas</h2>
          <p>
            Consulta las ubicaciones disponibles y administra sus datos y
            responsables.
          </p>
        </div>
        {canManage ? (
          <Button type="button" onClick={openCreate}>
            <Plus size={18} aria-hidden="true" />
            Nueva bodega
          </Button>
        ) : null}
      </div>

      <section className="module-panel" aria-label="Listado de bodegas">
        <form className="table-toolbar" onSubmit={submitSearch} role="search">
          <label className="table-search" htmlFor="warehouse-search">
            <MagnifyingGlass size={18} aria-hidden="true" />
            <Input
              id="warehouse-search"
              name="q"
              type="search"
              autoComplete="off"
              placeholder="Buscar por código, nombre o ubicación…"
              aria-label="Buscar bodegas"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </label>
          <div className="table-toolbar__filters">
            <label className="filter-control" htmlFor="warehouse-status-filter">
              <span>Estado</span>
              <select
                id="warehouse-status-filter"
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
              htmlFor="warehouse-page-size"
            >
              <span>Filas</span>
              <select
                id="warehouse-page-size"
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
            <h3>No se pudieron cargar las bodegas</h3>
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
            loadingLabel="Cargando bodegas…"
            regionLabel="Bodegas"
            emptyLabel={
              hasActiveFilters
                ? "No hay bodegas que coincidan con estos filtros."
                : canManage
                  ? "Aún no hay bodegas."
                  : "No tienes bodegas asignadas."
            }
            emptyState={
              !hasActiveFilters && !canManage ? (
                <div className="empty-content">
                  <h3>No tienes bodegas asignadas</h3>
                  <p>
                    Solicita al administrador acceso a una bodega para consultar
                    su información.
                  </p>
                </div>
              ) : !hasActiveFilters && canManage ? (
                <div className="empty-content">
                  <h3>Aún no hay bodegas</h3>
                  <p>
                    Registra una ubicación para organizar las operaciones
                    comerciales.
                  </p>
                  <Button type="button" onClick={openCreate}>
                    <Plus size={17} aria-hidden="true" />
                    Crear bodega
                  </Button>
                </div>
              ) : undefined
            }
          />
        )}

        {result?.pagination.total > 0 ? (
          <div className="table-pagination" aria-label="Paginación de bodegas">
            <p>
              {result.pagination.total === 1
                ? "1 bodega"
                : `${result.pagination.total} bodegas`}
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
            aria-describedby="warehouse-form-description"
          >
            <Dialog.Title className="module-dialog__title">
              {editing ? "Editar bodega" : "Nueva bodega"}
            </Dialog.Title>
            <Dialog.Description
              id="warehouse-form-description"
              className="module-dialog__description"
            >
              Registra la información básica y el responsable opcional.
            </Dialog.Description>
            <form
              className="module-form"
              onSubmit={form.handleSubmit(submitForm)}
              noValidate
            >
              <div className="form-field">
                <label htmlFor="warehouse-code">Código</label>
                <Input
                  id="warehouse-code"
                  autoComplete="off"
                  maxLength={40}
                  aria-invalid={Boolean(form.formState.errors.code)}
                  aria-describedby={
                    form.formState.errors.code
                      ? "warehouse-code-error"
                      : undefined
                  }
                  {...form.register("code")}
                />
                {form.formState.errors.code ? (
                  <span
                    className="field-error"
                    id="warehouse-code-error"
                    aria-live="polite"
                  >
                    {form.formState.errors.code.message}
                  </span>
                ) : null}
              </div>
              <div className="form-field">
                <label htmlFor="warehouse-name">Nombre</label>
                <Input
                  id="warehouse-name"
                  autoComplete="organization"
                  maxLength={120}
                  aria-invalid={Boolean(form.formState.errors.name)}
                  aria-describedby={
                    form.formState.errors.name
                      ? "warehouse-name-error"
                      : undefined
                  }
                  {...form.register("name")}
                />
                {form.formState.errors.name ? (
                  <span
                    className="field-error"
                    id="warehouse-name-error"
                    aria-live="polite"
                  >
                    {form.formState.errors.name.message}
                  </span>
                ) : null}
              </div>
              <div className="form-field">
                <label htmlFor="warehouse-location">
                  Ubicación <span>(opcional)</span>
                </label>
                <Input
                  id="warehouse-location"
                  autoComplete="street-address"
                  maxLength={255}
                  {...form.register("location")}
                />
              </div>
              <div className="form-field">
                <label htmlFor="warehouse-responsible">
                  Responsable (opcional)
                </label>
                <select
                  className="module-select"
                  id="warehouse-responsible"
                  {...form.register("responsibleUserId")}
                >
                  <option value="">Sin responsable</option>
                  {(responsibleQuery.data?.items || []).map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name} · {person.email}
                    </option>
                  ))}
                </select>
                {responsibleQuery.isError ? (
                  <span className="field-error" role="alert">
                    No se pudieron cargar los responsables.
                  </span>
                ) : null}
                {form.formState.errors.responsibleUserId ? (
                  <span className="field-error" aria-live="polite">
                    {form.formState.errors.responsibleUserId.message}
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
                      <Check size={17} aria-hidden="true" />
                      Guardar cambios
                    </>
                  ) : (
                    "Crear bodega"
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
            aria-describedby="warehouse-status-description"
          >
            <Dialog.Title className="module-dialog__title">
              {confirming?.isActive ? "Desactivar bodega" : "Activar bodega"}
            </Dialog.Title>
            <Dialog.Description
              id="warehouse-status-description"
              className="module-dialog__description"
            >
              {confirming?.isActive
                ? `“${confirming.name}” dejará de estar disponible para nuevas operaciones comerciales. Esta acción no elimina su información.`
                : `“${confirming?.name}” volverá a estar disponible para operaciones comerciales.`}
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
                    warehouse: confirming,
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

      <Dialog.Root
        open={Boolean(detailsId)}
        onOpenChange={(open) => {
          if (!open) setDetailsId(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="module-dialog-overlay" />
          <Dialog.Content
            className="module-dialog"
            aria-describedby="warehouse-detail-description"
          >
            <Dialog.Title className="module-dialog__title">
              Detalle de bodega
            </Dialog.Title>
            <Dialog.Description
              id="warehouse-detail-description"
              className="module-dialog__description"
            >
              Consulta la información de la bodega asignada.
            </Dialog.Description>
            {detailsQuery.isPending ? (
              <p role="status">Cargando detalle…</p>
            ) : detailsQuery.isError ? (
              <div role="alert">
                <p>No se pudo cargar el detalle.</p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => detailsQuery.refetch()}
                >
                  Reintentar
                </Button>
              </div>
            ) : detailsQuery.data ? (
              <dl className="warehouse-details">
                <div>
                  <dt>Código</dt>
                  <dd>{detailsQuery.data.code}</dd>
                </div>
                <div>
                  <dt>Nombre</dt>
                  <dd>{detailsQuery.data.name}</dd>
                </div>
                <div>
                  <dt>Ubicación</dt>
                  <dd>{detailsQuery.data.location || "Sin ubicación"}</dd>
                </div>
                <div>
                  <dt>Responsable</dt>
                  <dd>{detailsQuery.data.responsibleName || "Sin asignar"}</dd>
                </div>
                <div>
                  <dt>Estado</dt>
                  <dd>{detailsQuery.data.isActive ? "Activa" : "Inactiva"}</dd>
                </div>
                <div>
                  <dt>Última actualización</dt>
                  <dd>{formatDate(detailsQuery.data.updatedAt)}</dd>
                </div>
              </dl>
            ) : null}
            <div className="module-dialog__actions">
              <Dialog.Close asChild>
                <Button type="button" variant="secondary">
                  Cerrar
                </Button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
