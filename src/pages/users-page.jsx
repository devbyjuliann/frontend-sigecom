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
import { ApiError, usersApi, warehousesApi } from "../lib/auth-api.js";

const pageSizeOptions = [10, 25, 50];
const roleNames = {
  administrator: "Administrador",
  seller: "Vendedor",
  warehouse: "Bodega",
  auditor: "Auditor",
};
const formSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Escribe un correo válido.")
    .max(254),
  displayName: z
    .string()
    .trim()
    .min(1, "Escribe el nombre de la persona.")
    .max(120),
  roleCode: z.enum(["administrator", "seller", "warehouse", "auditor"]),
  warehouseIds: z
    .array(z.string())
    .min(1, "Asigna al menos una bodega activa."),
});
const columnHelper = createColumnHelper();
const listQueryKey = ["users", "list"];

function queryNumber(value, fallback, maximum) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= maximum
    ? number
    : fallback;
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session } = useAuth();
  const isAdministrator = session.user.role === "administrator";
  const canManage =
    isAdministrator &&
    session.permissions.includes("users.read") &&
    session.permissions.includes("users.manage");
  const canAssignRole =
    canManage && session.permissions.includes("roles.manage");
  const canAssignWarehouses =
    canManage && session.permissions.includes("warehouses.read");
  const page = queryNumber(searchParams.get("page"), 1, 1_000_000);
  const pageSize = pageSizeOptions.includes(
    Number(searchParams.get("pageSize")),
  )
    ? Number(searchParams.get("pageSize"))
    : 10;
  const query = searchParams.get("q") || "";
  const roleCode = ["administrator", "seller", "warehouse", "auditor"].includes(
    searchParams.get("roleCode"),
  )
    ? searchParams.get("roleCode")
    : "all";
  const status = ["active", "inactive"].includes(searchParams.get("status"))
    ? searchParams.get("status")
    : "all";
  const sortBy = ["name", "email", "role", "status", "updatedAt"].includes(
    searchParams.get("sortBy"),
  )
    ? searchParams.get("sortBy")
    : "name";
  const sortOrder = searchParams.get("sortOrder") === "desc" ? "desc" : "asc";
  const [searchInput, setSearchInput] = useState(query);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [loadingEditId, setLoadingEditId] = useState(null);
  const [selectedWarehouseIds, setSelectedWarehouseIds] = useState([]);
  const [initialWarehouseIds, setInitialWarehouseIds] = useState([]);
  const [warehouseQuery, setWarehouseQuery] = useState("");
  const [warehousePage, setWarehousePage] = useState(1);
  const [confirming, setConfirming] = useState(null);
  const [temporaryPassword, setTemporaryPassword] = useState(null);
  const [accessConfirmation, setAccessConfirmation] = useState(null);
  const [pendingFormValues, setPendingFormValues] = useState(null);
  const [savePending, setSavePending] = useState(false);

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      displayName: "",
      roleCode: "seller",
      warehouseIds: [],
    },
  });
  const listQuery = useQuery({
    queryKey: [
      ...listQueryKey,
      { page, pageSize, q: query, roleCode, status, sortBy, sortOrder },
    ],
    queryFn: () =>
      usersApi.list({
        page,
        pageSize,
        q: query,
        roleCode,
        status,
        sortBy,
        sortOrder,
      }),
    retry: false,
  });
  const rolesQuery = useQuery({
    queryKey: ["users", "roles"],
    queryFn: usersApi.roles,
    retry: false,
  });
  const warehouseQueryResult = useQuery({
    queryKey: [
      "users",
      "warehouse-options",
      { q: warehouseQuery, page: warehousePage },
    ],
    queryFn: () =>
      warehousesApi.list({
        q: warehouseQuery,
        status: "all",
        page: warehousePage,
        pageSize: 10,
        sortBy: "name",
        sortOrder: "asc",
      }),
    enabled: formOpen && canAssignWarehouses,
    retry: false,
  });
  const statusMutation = useMutation({
    mutationFn: async ({ user, isActive }) => {
      const current = await usersApi.get(user.id);
      return usersApi.setStatus(user.id, {
        expectedRevision: current.revision,
        isActive,
      });
    },
    onSuccess: async (_result, variables) => {
      setConfirming(null);
      toast.success(
        variables.isActive ? "Cuenta activada." : "Cuenta desactivada.",
      );
      await queryClient.invalidateQueries({ queryKey: listQueryKey });
    },
    onError: (error) =>
      toast.error(
        error.message || "No se pudo cambiar el estado de la cuenta.",
      ),
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

  function submitSearch(event) {
    event.preventDefault();
    updateSearchParams({ q: searchInput.trim(), page: null });
  }

  function openCreate() {
    setEditing(null);
    setSelectedWarehouseIds([]);
    setInitialWarehouseIds([]);
    setWarehouseQuery("");
    setWarehousePage(1);
    form.reset({
      email: "",
      displayName: "",
      roleCode: "seller",
      warehouseIds: [],
    });
    form.clearErrors();
    setFormOpen(true);
  }

  const openEdit = useCallback(
    async (user) => {
      if (!user.canManage) return;
      setLoadingEditId(user.id);
      try {
        const detail = await usersApi.get(user.id);
        setEditing(detail);
        const ids = detail.assignedWarehouses.map((warehouse) => warehouse.id);
        setInitialWarehouseIds(ids);
        setSelectedWarehouseIds(ids);
        setWarehouseQuery("");
        setWarehousePage(1);
        form.reset({
          email: detail.email,
          displayName: detail.displayName || "",
          roleCode: detail.roleCode,
          warehouseIds: ids,
        });
        form.clearErrors();
        setFormOpen(true);
      } catch (error) {
        toast.error(error.message || "No se pudo consultar la cuenta.");
      } finally {
        setLoadingEditId(null);
      }
    },
    [form],
  );

  function toggleWarehouse(id, checked) {
    setSelectedWarehouseIds((current) => {
      const next = checked
        ? [...new Set([...current, id])]
        : current.filter((item) => item !== id);
      form.setValue("warehouseIds", next, {
        shouldDirty: true,
        shouldValidate: true,
      });
      return next;
    });
  }

  function submitForm(values) {
    if (!editing) {
      void persistForm(values);
      return;
    }
    const changes = [];
    if (values.email !== editing.email) changes.push("correo de acceso");
    if (values.roleCode !== editing.roleCode) changes.push("rol asignado");
    if (
      selectedWarehouseIds.some((id) => !initialWarehouseIds.includes(id)) ||
      initialWarehouseIds.some((id) => !selectedWarehouseIds.includes(id))
    )
      changes.push("bodegas autorizadas");
    if (changes.length) {
      setPendingFormValues(values);
      setAccessConfirmation(changes);
      return;
    }
    void persistForm(values);
  }

  async function persistForm(values) {
    setSavePending(true);
    form.clearErrors("root.server");
    try {
      if (!editing) {
        const result = await usersApi.create({
          email: values.email,
          displayName: values.displayName,
          roleCode: values.roleCode,
          warehouseIds: selectedWarehouseIds,
        });
        setFormOpen(false);
        setTemporaryPassword(result.temporaryPassword);
        toast.success(
          "Cuenta creada. Entrega la contraseña temporal por un canal privado.",
        );
        await queryClient.invalidateQueries({ queryKey: listQueryKey });
        return;
      }

      const addIds = selectedWarehouseIds.filter(
        (id) => !initialWarehouseIds.includes(id),
      );
      const removeIds = initialWarehouseIds.filter(
        (id) => !selectedWarehouseIds.includes(id),
      );
      const input = { expectedRevision: editing.revision };
      if (values.displayName !== (editing.displayName || ""))
        input.displayName = values.displayName;
      if (values.email !== editing.email) input.email = values.email;
      if (values.roleCode !== editing.roleCode)
        input.roleCode = values.roleCode;
      if (addIds.length || removeIds.length)
        input.warehouseChanges = { addIds, removeIds };
      if (Object.keys(input).length === 1) {
        setFormOpen(false);
        return;
      }
      await usersApi.update(editing.id, input);
      setFormOpen(false);
      toast.success("Cambios de la cuenta guardados.");
      await queryClient.invalidateQueries({ queryKey: listQueryKey });
      if (
        editing.id === session.user.id &&
        (input.email || input.roleCode || input.warehouseChanges)
      ) {
        await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === "USER_EMAIL_TAKEN") {
        form.setError("email", {
          message: "Ya existe una cuenta con ese correo.",
        });
      } else if (
        error instanceof ApiError &&
        error.code === "USER_REVISION_CONFLICT"
      ) {
        form.setError("root.server", {
          type: error.code,
          message:
            "La cuenta cambió en otra sesión. Recarga sus datos antes de volver a guardar.",
        });
      } else if (
        error instanceof ApiError &&
        error.code === "USER_WAREHOUSE_SCOPE_REQUIRED"
      ) {
        form.setError("root.server", {
          message:
            "Esta cuenta tiene bodegas fuera de tu alcance. Debe intervenir un Administrador autorizado para todas sus bodegas.",
        });
      } else if (
        error instanceof ApiError &&
        error.code === "NETWORK_ERROR" &&
        !editing
      ) {
        form.setError("root.server", {
          message:
            "La respuesta del alta no se confirmó. Verifica el listado de usuarios antes de intentar crear la cuenta de nuevo.",
        });
      } else {
        form.setError("root.server", {
          message: error.message || "No se pudo guardar la cuenta.",
        });
      }
    } finally {
      setSavePending(false);
    }
  }

  async function reloadEditingAccount() {
    if (!editing) return;
    try {
      const detail = await usersApi.get(editing.id);
      const ids = detail.assignedWarehouses.map((warehouse) => warehouse.id);
      setEditing(detail);
      setInitialWarehouseIds(ids);
      setSelectedWarehouseIds(ids);
      form.reset({
        email: detail.email,
        displayName: detail.displayName || "",
        roleCode: detail.roleCode,
        warehouseIds: ids,
      });
    } catch (error) {
      toast.error(error.message || "No se pudieron recargar los datos.");
    }
  }

  const columns = useMemo(() => {
    const base = [
      columnHelper.accessor("displayName", {
        id: "name",
        header: ({ column }) => (
          <SortableHeading column={column}>Nombre</SortableHeading>
        ),
        cell: ({ row }) => (
          <div className="user-name-cell">
            <span className="table-primary-cell">
              {row.original.displayName || "Sin nombre"}
            </span>
            <span className="table-secondary-cell">{row.original.email}</span>
          </div>
        ),
      }),
      columnHelper.accessor("roleCode", {
        id: "role",
        header: ({ column }) => (
          <SortableHeading column={column}>Rol</SortableHeading>
        ),
        cell: (info) => (
          <span>{roleNames[info.getValue()] || info.getValue()}</span>
        ),
      }),
      columnHelper.accessor("warehouseCount", {
        id: "warehouses",
        header: "Bodegas",
        enableSorting: false,
        cell: ({ row }) => (
          <span>
            {row.original.visibleWarehouseCount === row.original.warehouseCount
              ? row.original.warehouseCount
              : `${row.original.visibleWarehouseCount} de ${row.original.warehouseCount}`}{" "}
            asignada{row.original.warehouseCount === 1 ? "" : "s"}
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
      columnHelper.accessor("passwordChangeRequired", {
        id: "passwordChange",
        header: "Contraseña",
        enableSorting: false,
        cell: (info) => (
          <span className="table-secondary-cell">
            {info.getValue() ? "Cambio pendiente" : "Actualizada"}
          </span>
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: "Acciones",
        cell: ({ row }) => {
          const current = row.original;
          if (!canManage) return null;
          if (!current.canManage)
            return (
              <span
                className="user-scope-note"
                title="La cuenta tiene asignaciones en bodegas fuera de tu alcance."
              >
                Fuera de alcance
              </span>
            );
          return (
            <div className="table-actions">
              <Button
                className="table-icon-button"
                variant="ghost"
                type="button"
                disabled={loadingEditId === current.id}
                aria-label={`Editar ${current.displayName || current.email}`}
                onClick={() => openEdit(current)}
              >
                <PencilSimple size={17} aria-hidden="true" />
              </Button>
              {current.id === session.user.id ? (
                <span className="table-secondary-cell">Cuenta propia</span>
              ) : (
                <Button
                  className="table-icon-button"
                  variant="ghost"
                  type="button"
                  aria-label={`${current.isActive ? "Desactivar" : "Activar"} ${current.displayName || current.email}`}
                  onClick={() => setConfirming(current)}
                >
                  <Power size={17} aria-hidden="true" />
                </Button>
              )}
            </div>
          );
        },
      }),
    ];
    return base;
  }, [canManage, loadingEditId, openEdit, session.user.id]);

  const result = listQuery.data;
  const pageCount = result?.pagination.pageCount || 0;
  const hasFilters = Boolean(query) || roleCode !== "all" || status !== "all";
  const warehouseResult = warehouseQueryResult.data;

  return (
    <section className="users-page" aria-labelledby="users-title">
      <div className="module-heading">
        <div>
          <h2 id="users-title">Usuarios</h2>
          <p>Administra las cuentas, roles y bodegas autorizadas del equipo.</p>
        </div>
        {canManage && canAssignRole && canAssignWarehouses ? (
          <Button type="button" onClick={openCreate}>
            <Plus size={18} aria-hidden="true" />
            Nuevo usuario
          </Button>
        ) : null}
      </div>

      <section className="module-panel" aria-label="Listado de usuarios">
        <form className="table-toolbar" onSubmit={submitSearch} role="search">
          <label className="table-search" htmlFor="user-search">
            <MagnifyingGlass size={18} aria-hidden="true" />
            <Input
              id="user-search"
              type="search"
              autoComplete="off"
              placeholder="Buscar por nombre o correo…"
              aria-label="Buscar por nombre o correo"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </label>
          <div className="table-toolbar__filters">
            <label className="filter-control" htmlFor="user-role-filter">
              <span>Rol</span>
              <select
                id="user-role-filter"
                value={roleCode}
                onChange={(event) =>
                  updateSearchParams({
                    roleCode: event.target.value,
                    page: null,
                  })
                }
              >
                <option value="all">Todos</option>
                {(rolesQuery.data?.items || []).map((role) => (
                  <option key={role.code} value={role.code}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-control" htmlFor="user-status-filter">
              <span>Estado</span>
              <select
                id="user-status-filter"
                value={status}
                onChange={(event) =>
                  updateSearchParams({ status: event.target.value, page: null })
                }
              >
                <option value="all">Todos</option>
                <option value="active">Activos</option>
                <option value="inactive">Inactivos</option>
              </select>
            </label>
            <label
              className="filter-control filter-control--page-size"
              htmlFor="user-page-size"
            >
              <span>Filas</span>
              <select
                id="user-page-size"
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
        {rolesQuery.isError ? (
          <p className="field-error" role="alert">
            No se pudieron cargar los roles disponibles.
          </p>
        ) : null}
        {listQuery.isError ? (
          <div className="table-state table-state--error" role="alert">
            <h3>No se pudieron cargar los usuarios</h3>
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
            regionLabel="Usuarios"
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
            loadingLabel="Cargando usuarios…"
            emptyLabel={
              hasFilters
                ? "No hay usuarios que coincidan con estos filtros."
                : "Aún no hay cuentas de usuario."
            }
          />
        )}
        {result?.pagination.total > 0 ? (
          <div className="table-pagination" aria-label="Paginación de usuarios">
            <p>
              {result.pagination.total === 1
                ? "1 usuario"
                : `${result.pagination.total} usuarios`}
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
          if (!open) {
            form.clearErrors();
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="module-dialog-overlay" />
          <Dialog.Content
            className="module-dialog user-dialog"
            aria-describedby="user-form-description"
          >
            <Dialog.Title className="module-dialog__title">
              {editing ? "Editar usuario" : "Nuevo usuario"}
            </Dialog.Title>
            <Dialog.Description
              id="user-form-description"
              className="module-dialog__description"
            >
              {editing
                ? "Actualiza los datos y el alcance de acceso de esta cuenta."
                : "Crea una cuenta administrada internamente y define su alcance inicial."}
            </Dialog.Description>
            {editing?.hasOutOfScopeWarehouses ? (
              <div className="user-scope-warning" role="alert">
                Esta cuenta tiene asignaciones en bodegas fuera de tu alcance.
                Solicita la intervención de un Administrador autorizado para
                todas sus bodegas.
              </div>
            ) : null}
            {editing && !editing.canManage ? (
              <div className="user-scope-warning" role="alert">
                Esta cuenta no se puede modificar con tu alcance actual.
              </div>
            ) : null}
            <form
              className="module-form"
              onSubmit={form.handleSubmit(submitForm)}
              noValidate
            >
              <div className="form-field">
                <label htmlFor="user-display-name">Nombre completo</label>
                <Input
                  id="user-display-name"
                  autoComplete="name"
                  maxLength={120}
                  disabled={Boolean(editing && !editing.canManage)}
                  aria-invalid={Boolean(form.formState.errors.displayName)}
                  aria-describedby={
                    form.formState.errors.displayName
                      ? "user-name-error"
                      : undefined
                  }
                  {...form.register("displayName")}
                />
                {form.formState.errors.displayName ? (
                  <span
                    className="field-error"
                    id="user-name-error"
                    aria-live="polite"
                  >
                    {form.formState.errors.displayName.message}
                  </span>
                ) : null}
              </div>
              <div className="form-field">
                <label htmlFor="user-email">Correo electrónico</label>
                <Input
                  id="user-email"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  disabled={Boolean(editing && !editing.canManage)}
                  aria-invalid={Boolean(form.formState.errors.email)}
                  aria-describedby={
                    form.formState.errors.email ? "user-email-error" : undefined
                  }
                  {...form.register("email")}
                />
                {form.formState.errors.email ? (
                  <span
                    className="field-error"
                    id="user-email-error"
                    aria-live="polite"
                  >
                    {form.formState.errors.email.message}
                  </span>
                ) : null}
              </div>
              <div className="form-field">
                <label htmlFor="user-role">Rol asignado</label>
                <select
                  className="module-select"
                  id="user-role"
                  disabled={
                    !canAssignRole || Boolean(editing && !editing.canManage)
                  }
                  {...form.register("roleCode")}
                >
                  {(rolesQuery.data?.items || []).map((role) => (
                    <option key={role.code} value={role.code}>
                      {role.name}
                    </option>
                  ))}
                </select>
                {!canAssignRole ? (
                  <span className="table-secondary-cell">
                    No tienes permiso para cambiar el rol.
                  </span>
                ) : null}
              </div>
              <fieldset
                className="user-warehouse-picker"
                disabled={
                  !canAssignWarehouses || Boolean(editing && !editing.canManage)
                }
              >
                <legend>Bodegas autorizadas</legend>
                <p>
                  Solo puedes asignar bodegas activas que también estén
                  autorizadas para tu cuenta.
                </p>
                <label className="table-search" htmlFor="user-warehouse-search">
                  <MagnifyingGlass size={18} aria-hidden="true" />
                  <Input
                    id="user-warehouse-search"
                    type="search"
                    aria-label="Buscar bodegas autorizadas"
                    autoComplete="off"
                    placeholder="Buscar bodegas…"
                    value={warehouseQuery}
                    onChange={(event) => {
                      setWarehouseQuery(event.target.value);
                      setWarehousePage(1);
                    }}
                  />
                </label>
                {warehouseQueryResult.isError ? (
                  <p className="field-error" role="alert">
                    No se pudieron cargar las bodegas.
                  </p>
                ) : warehouseQueryResult.isPending ? (
                  <p role="status">Cargando bodegas…</p>
                ) : (
                  <div className="user-warehouse-options">
                    {(warehouseResult?.items || []).map((warehouse) => (
                      <label
                        key={warehouse.id}
                        className="user-warehouse-option"
                      >
                        <input
                          type="checkbox"
                          checked={selectedWarehouseIds.includes(warehouse.id)}
                          disabled={
                            !warehouse.isActive &&
                            !initialWarehouseIds.includes(warehouse.id)
                          }
                          onChange={(event) =>
                            toggleWarehouse(warehouse.id, event.target.checked)
                          }
                        />
                        <span>
                          <strong>{warehouse.name}</strong>
                          <small>
                            {warehouse.code}
                            {warehouse.isActive ? " · Activa" : " · Inactiva"}
                          </small>
                        </span>
                      </label>
                    ))}
                    {!warehouseResult?.items?.length ? (
                      <p role="status">
                        No hay bodegas disponibles con esta búsqueda.
                      </p>
                    ) : null}
                  </div>
                )}
                {warehouseResult?.pagination?.total > 0 ? (
                  <div className="user-warehouse-pagination">
                    <span>
                      {selectedWarehouseIds.length} seleccionada
                      {selectedWarehouseIds.length === 1 ? "" : "s"} · Página{" "}
                      {warehousePage} de{" "}
                      {Math.max(warehouseResult.pagination.pageCount, 1)}
                    </span>
                    <div>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={
                          warehousePage <= 1 || warehouseQueryResult.isFetching
                        }
                        onClick={() =>
                          setWarehousePage((current) => current - 1)
                        }
                      >
                        Anterior
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={
                          warehousePage >=
                            warehouseResult.pagination.pageCount ||
                          warehouseQueryResult.isFetching
                        }
                        onClick={() =>
                          setWarehousePage((current) => current + 1)
                        }
                      >
                        Siguiente
                      </Button>
                    </div>
                  </div>
                ) : null}
              </fieldset>
              {form.formState.errors.warehouseIds ? (
                <span className="field-error" role="alert">
                  {form.formState.errors.warehouseIds.message}
                </span>
              ) : null}
              {editing ? (
                <div className="user-account-state">
                  <span>Estado de la cuenta</span>
                  <strong>{editing.isActive ? "Activa" : "Inactiva"}</strong>
                  <span>
                    {editing.passwordChangeRequired
                      ? "Debe cambiar su contraseña al ingresar."
                      : "Contraseña actualizada."}
                  </span>
                </div>
              ) : (
                <p className="user-account-state">
                  La cuenta se creará activa y deberá cambiar la contraseña
                  temporal en su primer inicio de sesión.
                </p>
              )}
              {form.formState.errors.root?.server ? (
                <div className="user-scope-warning" role="alert">
                  <p>{form.formState.errors.root.server.message}</p>
                  {form.formState.errors.root.server.type ===
                  "USER_REVISION_CONFLICT" ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={reloadEditingAccount}
                    >
                      Recargar datos actuales
                    </Button>
                  ) : null}
                </div>
              ) : null}
              <div className="module-dialog__actions">
                <Dialog.Close asChild>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={savePending}
                  >
                    Cancelar
                  </Button>
                </Dialog.Close>
                <Button
                  type="submit"
                  disabled={
                    savePending ||
                    (editing && !editing.canManage) ||
                    !canAssignWarehouses ||
                    (!editing && !canAssignRole)
                  }
                >
                  {savePending ? (
                    "Guardando…"
                  ) : editing ? (
                    <>
                      <Check size={17} aria-hidden="true" />
                      Guardar cambios
                    </>
                  ) : (
                    "Crear usuario"
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
            aria-describedby="user-status-description"
          >
            <Dialog.Title className="module-dialog__title">
              {confirming?.isActive ? "Desactivar cuenta" : "Activar cuenta"}
            </Dialog.Title>
            <Dialog.Description
              id="user-status-description"
              className="module-dialog__description"
            >
              {confirming?.isActive
                ? `La cuenta de “${confirming.displayName || confirming.email}” perderá acceso y sus sesiones activas serán revocadas. No se eliminará su información.`
                : `La cuenta de “${confirming?.displayName || confirming?.email}” recuperará acceso. Debe conservar una bodega activa asignada.`}
            </Dialog.Description>
            <p className="user-confirm-note">
              El cambio se registra en auditoría. Las sesiones anteriores no se
              restauran.
            </p>
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
                    user: confirming,
                    isActive: !confirming.isActive,
                  })
                }
              >
                {statusMutation.isPending
                  ? "Guardando…"
                  : confirming?.isActive
                    ? "Desactivar cuenta"
                    : "Activar cuenta"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={Boolean(accessConfirmation)}
        onOpenChange={(open) => {
          if (!open) {
            setAccessConfirmation(null);
            setPendingFormValues(null);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="module-dialog-overlay" />
          <Dialog.Content
            className="module-dialog module-dialog--confirm"
            aria-describedby="user-access-confirm-description"
          >
            <Dialog.Title className="module-dialog__title">
              Confirmar cambio de acceso
            </Dialog.Title>
            <Dialog.Description
              id="user-access-confirm-description"
              className="module-dialog__description"
            >
              Vas a modificar: {accessConfirmation?.join(", ")}. Las sesiones
              activas de la cuenta se revocarán y será necesario iniciar sesión
              de nuevo.
            </Dialog.Description>
            <div className="module-dialog__actions">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setAccessConfirmation(null);
                  setPendingFormValues(null);
                }}
              >
                Volver al formulario
              </Button>
              <Button
                type="button"
                disabled={savePending}
                onClick={() => {
                  const values = pendingFormValues;
                  setAccessConfirmation(null);
                  setPendingFormValues(null);
                  if (values) void persistForm(values);
                }}
              >
                {savePending ? "Guardando…" : "Confirmar cambios"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={Boolean(temporaryPassword)}
        onOpenChange={(open) => {
          if (!open) setTemporaryPassword(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="module-dialog-overlay" />
          <Dialog.Content
            className="module-dialog user-dialog user-secret-dialog"
            aria-describedby="temporary-password-description"
          >
            <Dialog.Title className="module-dialog__title">
              Entrega segura de contraseña
            </Dialog.Title>
            <Dialog.Description
              id="temporary-password-description"
              className="module-dialog__description"
            >
              Esta contraseña se muestra una sola vez. Transmítela al usuario
              por un canal privado.
            </Dialog.Description>
            <div className="user-secret-value" aria-label="Contraseña temporal">
              {temporaryPassword}
            </div>
            <p className="user-confirm-note">
              No cierres este panel hasta haberla entregado. SIGECOM no puede
              recuperar esta contraseña si se pierde.
            </p>
            <div className="module-dialog__actions">
              <Button
                type="button"
                onClick={() => setTemporaryPassword(null)}
                aria-label="Cerrar entrega segura"
              >
                Cerrar y borrar
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
