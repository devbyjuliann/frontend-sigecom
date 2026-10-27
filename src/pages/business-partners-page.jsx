import { useCallback, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { createColumnHelper } from "@tanstack/react-table";
import * as Dialog from "@radix-ui/react-dialog";
import { AddressBook } from "@phosphor-icons/react/AddressBook";
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
import { ApiError, customersApi, suppliersApi } from "../lib/auth-api.js";

const pageSizeOptions = [10, 25, 50];
const columnHelper = createColumnHelper();
const separatorPattern = /[ .-]/g;
const phonePattern = /^[\p{L}\p{N}+()\s./#-]*$/u;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

const resourceConfig = {
  customers: {
    title: "Clientes",
    singular: "cliente",
    gender: "o",
    permission: "customers",
    api: customersApi,
    nameKey: "name",
    nameLabel: "Nombre o razón social",
    nameRequiredMessage: "Escribe el nombre o razón social.",
    searchLabel: "Buscar clientes por nombre, identificación o correo",
    emptyTitle: "Aún no hay clientes",
    emptyDescription:
      "Registra tus clientes mayoristas para tener su información de contacto disponible.",
  },
  suppliers: {
    title: "Proveedores",
    singular: "proveedor",
    gender: "o",
    permission: "suppliers",
    api: suppliersApi,
    nameKey: "businessName",
    nameLabel: "Razón social o nombre comercial",
    nameRequiredMessage: "Escribe la razón social o nombre comercial.",
    searchLabel: "Buscar proveedores por nombre, identificación o contacto",
    emptyTitle: "Aún no hay proveedores",
    emptyDescription:
      "Registra proveedores para consultar sus datos comerciales y de contacto.",
  },
};

function normalizeIdentification(value) {
  return value.trim().toUpperCase().replace(separatorPattern, "");
}

function createFormSchema(resource) {
  const config = resourceConfig[resource];
  const fields = {
    identificationType: z.string().trim().max(30),
    identificationNumber: z
      .string()
      .trim()
      .min(1, "Escribe el número de identificación.")
      .max(64, "El número no puede superar 64 caracteres.")
      .refine(
        (value) => /[\p{L}\p{N}]/u.test(normalizeIdentification(value)),
        "El número debe incluir al menos una letra o un número.",
      ),
    phone: z
      .string()
      .trim()
      .max(40, "El teléfono no puede superar 40 caracteres.")
      .regex(phonePattern, "Revisa el formato del teléfono.")
      .refine(
        (value) => !value || /\p{N}/u.test(value),
        "El teléfono debe incluir al menos un número.",
      ),
    email: z
      .string()
      .trim()
      .max(254, "El correo no puede superar 254 caracteres.")
      .refine(
        (value) => !value || emailPattern.test(value),
        "Escribe un correo electrónico válido.",
      ),
    address: z
      .string()
      .trim()
      .max(255, "La dirección no puede superar 255 caracteres."),
    isActive: z.boolean(),
  };
  fields[config.nameKey] = z
    .string()
    .trim()
    .min(1, config.nameRequiredMessage)
    .max(180, "El nombre no puede superar 180 caracteres.");
  if (resource === "suppliers") {
    fields.contactName = z
      .string()
      .trim()
      .max(120, "El contacto no puede superar 120 caracteres.");
  }
  return z.object(fields);
}

function queryNumber(value, fallback, maximum) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= maximum
    ? number
    : fallback;
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(new Date(value));
}

function formDefaults(resource) {
  return {
    identificationType: "",
    identificationNumber: "",
    [resourceConfig[resource].nameKey]: "",
    ...(resource === "suppliers" ? { contactName: "" } : {}),
    phone: "",
    email: "",
    address: "",
    isActive: true,
  };
}

function formValues(partner, resource) {
  return {
    identificationType: partner.identificationType || "",
    identificationNumber: partner.identificationNumber || "",
    [resourceConfig[resource].nameKey]:
      partner[resourceConfig[resource].nameKey] || "",
    ...(resource === "suppliers"
      ? { contactName: partner.contactName || "" }
      : {}),
    phone: partner.phone || "",
    email: partner.email || "",
    address: partner.address || "",
    isActive: partner.isActive,
  };
}

function requestInput(values, resource) {
  const config = resourceConfig[resource];
  return {
    identificationType: values.identificationType.trim() || null,
    identificationNumber: values.identificationNumber.trim(),
    [config.nameKey]: values[config.nameKey].trim(),
    ...(resource === "suppliers"
      ? { contactName: values.contactName.trim() || null }
      : {}),
    phone: values.phone.trim() || null,
    email: values.email.trim() || null,
    address: values.address.trim() || null,
    isActive: values.isActive,
  };
}

function displayName(partner, resource) {
  return partner ? partner[resourceConfig[resource].nameKey] : "";
}

export function BusinessPartnersPage({ resource }) {
  const config = resourceConfig[resource];
  if (!config) throw new Error("El módulo de terceros indicado no existe.");

  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session } = useAuth();
  const canManage = session.permissions.includes(`${config.permission}.manage`);
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
    "identification",
    "name",
    "status",
    "createdAt",
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

  const listQueryKey = [config.permission, "list"];
  const listQuery = useQuery({
    queryKey: [
      ...listQueryKey,
      { page, pageSize, q: query, status, sortBy, sortOrder },
    ],
    queryFn: () =>
      config.api.list({ page, pageSize, q: query, status, sortBy, sortOrder }),
    retry: false,
  });
  const detailQuery = useQuery({
    queryKey: [config.permission, "detail", detailsId],
    queryFn: () => config.api.get(detailsId),
    enabled: Boolean(detailsId),
    retry: false,
  });

  const form = useForm({
    resolver: zodResolver(createFormSchema(resource)),
    defaultValues: formDefaults(resource),
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
    form.reset(formDefaults(resource));
    setFormOpen(true);
  }

  const openEdit = useCallback(
    (partner) => {
      setEditing(partner);
      form.reset(formValues(partner, resource));
      setFormOpen(true);
    },
    [form, resource],
  );

  const saveMutation = useMutation({
    mutationFn: (values) => {
      const input = requestInput(values, resource);
      return editing
        ? config.api.update(editing.id, input)
        : config.api.create(input);
    },
    onSuccess: async () => {
      setFormOpen(false);
      toast.success(
        editing
          ? `${config.title.slice(0, -1)} actualizado.`
          : `${config.title.slice(0, -1)} creado.`,
      );
      await queryClient.invalidateQueries({ queryKey: [config.permission] });
    },
    onError: (error) => {
      if (
        error instanceof ApiError &&
        error.code.endsWith("IDENTIFICATION_TAKEN")
      ) {
        form.setError("identificationNumber", {
          message: "Ya existe un registro con ese número de identificación.",
        });
        return;
      }
      toast.error(error.message || `No se pudo guardar el ${config.singular}.`);
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ partner, isActive }) =>
      config.api.setStatus(partner.id, isActive),
    onSuccess: async (_partner, { isActive }) => {
      setConfirming(null);
      toast.success(
        isActive
          ? `${config.title.slice(0, -1)} activado.`
          : `${config.title.slice(0, -1)} desactivado.`,
      );
      await queryClient.invalidateQueries({ queryKey: [config.permission] });
    },
    onError: (error) =>
      toast.error(
        error.message || `No se pudo cambiar el estado del ${config.singular}.`,
      ),
  });

  const columns = useMemo(() => {
    const nameHeader =
      config.nameKey === "name"
        ? "Nombre o razón social"
        : "Razón social / nombre comercial";
    const result = [
      columnHelper.accessor("identificationNumber", {
        id: "identification",
        header: ({ column }) => (
          <SortableHeading column={column}>Identificación</SortableHeading>
        ),
        cell: (info) => (
          <span className="partner-identification" translate="no">
            {info.row.original.identificationType
              ? `${info.row.original.identificationType} · `
              : ""}
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor(config.nameKey, {
        id: "name",
        header: ({ column }) => (
          <SortableHeading column={column}>{nameHeader}</SortableHeading>
        ),
        cell: (info) => (
          <span className="table-primary-cell">{info.getValue()}</span>
        ),
      }),
    ];
    if (resource === "suppliers") {
      result.push(
        columnHelper.accessor("contactName", {
          header: "Contacto",
          cell: (info) => (
            <span className="table-secondary-cell">
              {info.getValue() || "Sin contacto"}
            </span>
          ),
          enableSorting: false,
        }),
      );
    }
    result.push(
      columnHelper.accessor("phone", {
        header: "Teléfono",
        cell: (info) => (
          <span className="table-secondary-cell" translate="no">
            {info.getValue() || "Sin teléfono"}
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
            {info.getValue() ? "Activo" : "Inactivo"}
          </span>
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: "Acciones",
        cell: ({ row }) => (
          <div className="table-actions">
            <Button
              className="table-icon-button"
              variant="ghost"
              type="button"
              aria-label={`Ver ${config.singular} ${row.original.identificationNumber}`}
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
                  aria-label={`Editar ${row.original.identificationNumber}`}
                  onClick={() => openEdit(row.original)}
                >
                  <PencilSimple size={17} aria-hidden="true" />
                </Button>
                <Button
                  className="table-icon-button"
                  variant="ghost"
                  type="button"
                  aria-label={`${row.original.isActive ? "Desactivar" : "Activar"} ${row.original.identificationNumber}`}
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
    return result;
  }, [canManage, config, openEdit, resource]);

  const result = listQuery.data;
  const pageCount = result?.pagination.pageCount || 0;
  const hasFilters = Boolean(query) || status !== "all";
  const detail = detailQuery.data;

  function submitSearch(event) {
    event.preventDefault();
    updateSearchParams({ q: searchInput.trim(), page: null });
  }

  function submitForm(values) {
    saveMutation.mutate({
      ...values,
      identificationNumber: values.identificationNumber.trim(),
    });
  }

  return (
    <section className="categories-page" aria-labelledby="partners-title">
      <div className="module-heading">
        <div>
          <h2 id="partners-title">{config.title}</h2>
          <p>
            {resource === "customers"
              ? "Consulta y administra la información de tus clientes mayoristas."
              : "Consulta y administra la información de tus proveedores comerciales."}
          </p>
        </div>
        {canManage ? (
          <Button type="button" onClick={openCreate}>
            <Plus size={18} aria-hidden="true" />
            Nuevo {config.singular}
          </Button>
        ) : null}
      </div>

      <section
        className="module-panel"
        aria-label={`Listado de ${config.title.toLocaleLowerCase("es-CO")}`}
      >
        <form className="table-toolbar" onSubmit={submitSearch} role="search">
          <label className="table-search" htmlFor="partners-search">
            <MagnifyingGlass size={18} aria-hidden="true" />
            <Input
              id="partners-search"
              type="search"
              autoComplete="off"
              placeholder="Buscar por identificación, nombre o contacto…"
              aria-label={config.searchLabel}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </label>
          <div className="table-toolbar__filters">
            <label className="filter-control" htmlFor="partners-status-filter">
              <span>Estado</span>
              <select
                id="partners-status-filter"
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
              htmlFor="partners-page-size"
            >
              <span>Filas</span>
              <select
                id="partners-page-size"
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
            <h3>
              No se pudieron cargar {config.title.toLocaleLowerCase("es-CO")}
            </h3>
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
            regionLabel={config.title}
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
            loadingLabel={`Cargando ${config.title.toLocaleLowerCase("es-CO")}…`}
            emptyLabel={
              hasFilters
                ? `No hay ${config.title.toLocaleLowerCase("es-CO")} que coincidan con estos filtros.`
                : config.emptyTitle
            }
            emptyState={
              !hasFilters && canManage ? (
                <div className="empty-content">
                  <span className="partner-empty-icon">
                    <AddressBook size={24} aria-hidden="true" />
                  </span>
                  <h3>{config.emptyTitle}</h3>
                  <p>{config.emptyDescription}</p>
                  <Button type="button" onClick={openCreate}>
                    <Plus size={17} aria-hidden="true" />
                    Crear {config.singular}
                  </Button>
                </div>
              ) : undefined
            }
          />
        )}

        {result?.pagination.total > 0 ? (
          <div
            className="table-pagination"
            aria-label={`Paginación de ${config.title.toLocaleLowerCase("es-CO")}`}
          >
            <p>
              {result.pagination.total === 1
                ? `1 ${config.singular}`
                : `${result.pagination.total} ${config.title.toLocaleLowerCase("es-CO")}`}
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

      {canManage ? (
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
              className="module-dialog module-dialog--partner"
              aria-describedby="partner-form-description"
            >
              <Dialog.Title className="module-dialog__title">
                {editing
                  ? `Editar ${config.singular}`
                  : `Nuevo ${config.singular}`}
              </Dialog.Title>
              <Dialog.Description
                id="partner-form-description"
                className="module-dialog__description"
              >
                {resource === "customers"
                  ? "Registra la identificación y los datos de contacto disponibles."
                  : "Registra la identificación y los datos comerciales disponibles. Los contactos secundarios son opcionales."}
              </Dialog.Description>
              <form
                className="module-form partner-form"
                onSubmit={form.handleSubmit(submitForm)}
                noValidate
              >
                <fieldset className="partner-form-section">
                  <legend>Identificación</legend>
                  <div className="partner-form-grid">
                    <div className="form-field">
                      <label htmlFor="partner-identification-type">
                        Tipo de identificación <span>(opcional)</span>
                      </label>
                      <Input
                        id="partner-identification-type"
                        autoComplete="off"
                        maxLength={30}
                        placeholder="CC, NIT, pasaporte…"
                        aria-invalid={Boolean(
                          form.formState.errors.identificationType,
                        )}
                        {...form.register("identificationType")}
                      />
                      {form.formState.errors.identificationType ? (
                        <span className="field-error" role="alert">
                          {form.formState.errors.identificationType.message}
                        </span>
                      ) : null}
                    </div>
                    <div className="form-field">
                      <label htmlFor="partner-identification-number">
                        Número de identificación
                      </label>
                      <Input
                        id="partner-identification-number"
                        autoComplete="off"
                        maxLength={64}
                        aria-invalid={Boolean(
                          form.formState.errors.identificationNumber,
                        )}
                        {...form.register("identificationNumber")}
                      />
                      {form.formState.errors.identificationNumber ? (
                        <span className="field-error" role="alert">
                          {form.formState.errors.identificationNumber.message}
                        </span>
                      ) : (
                        <span className="field-hint">
                          No se restringe a un tipo de documento nacional.
                        </span>
                      )}
                    </div>
                    <div className="form-field partner-form-grid__wide">
                      <label htmlFor="partner-name">{config.nameLabel}</label>
                      <Input
                        id="partner-name"
                        autoComplete="organization"
                        maxLength={180}
                        aria-invalid={Boolean(
                          form.formState.errors[config.nameKey],
                        )}
                        {...form.register(config.nameKey)}
                      />
                      {form.formState.errors[config.nameKey] ? (
                        <span className="field-error" role="alert">
                          {form.formState.errors[config.nameKey].message}
                        </span>
                      ) : null}
                    </div>
                    {resource === "suppliers" ? (
                      <div className="form-field partner-form-grid__wide">
                        <label htmlFor="partner-contact-name">
                          Persona de contacto <span>(opcional)</span>
                        </label>
                        <Input
                          id="partner-contact-name"
                          autoComplete="name"
                          maxLength={120}
                          {...form.register("contactName")}
                        />
                      </div>
                    ) : null}
                  </div>
                </fieldset>

                <fieldset className="partner-form-section">
                  <legend>
                    Información de contacto <span>(opcional)</span>
                  </legend>
                  <div className="partner-form-grid">
                    <div className="form-field">
                      <label htmlFor="partner-phone">Teléfono</label>
                      <Input
                        id="partner-phone"
                        type="tel"
                        autoComplete="tel"
                        maxLength={40}
                        aria-invalid={Boolean(form.formState.errors.phone)}
                        {...form.register("phone")}
                      />
                      {form.formState.errors.phone ? (
                        <span className="field-error" role="alert">
                          {form.formState.errors.phone.message}
                        </span>
                      ) : null}
                    </div>
                    <div className="form-field">
                      <label htmlFor="partner-email">Correo electrónico</label>
                      <Input
                        id="partner-email"
                        type="email"
                        autoComplete="email"
                        maxLength={254}
                        aria-invalid={Boolean(form.formState.errors.email)}
                        {...form.register("email")}
                      />
                      {form.formState.errors.email ? (
                        <span className="field-error" role="alert">
                          {form.formState.errors.email.message}
                        </span>
                      ) : null}
                    </div>
                    <div className="form-field partner-form-grid__wide">
                      <label htmlFor="partner-address">Dirección</label>
                      <textarea
                        className="module-textarea"
                        id="partner-address"
                        rows={2}
                        maxLength={255}
                        {...form.register("address")}
                      />
                    </div>
                  </div>
                </fieldset>

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
                      `Crear ${config.singular}`
                    )}
                  </Button>
                </div>
              </form>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      ) : null}

      {canManage ? (
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
              aria-describedby="partner-status-description"
            >
              <Dialog.Title className="module-dialog__title">
                {confirming?.isActive
                  ? `Desactivar ${config.singular}`
                  : `Activar ${config.singular}`}
              </Dialog.Title>
              <Dialog.Description
                id="partner-status-description"
                className="module-dialog__description"
              >
                {confirming?.isActive
                  ? `“${displayName(confirming, resource)}” dejará de estar disponible para futuras operaciones. Su registro se conservará.`
                  : `“${displayName(confirming, resource)}” volverá a estar disponible.`}
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
                      partner: confirming,
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
      ) : null}

      <Dialog.Root
        open={Boolean(detailsId)}
        onOpenChange={(open) => {
          if (!open) setDetailsId(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="module-dialog-overlay" />
          <Dialog.Content
            className="module-dialog module-dialog--partner"
            aria-describedby="partner-detail-description"
          >
            <Dialog.Title className="module-dialog__title">
              Detalle del {config.singular}
            </Dialog.Title>
            <Dialog.Description
              id="partner-detail-description"
              className="module-dialog__description"
            >
              Consulta la identificación y los datos de contacto registrados.
            </Dialog.Description>
            {detailQuery.isPending ? (
              <p role="status">Cargando información…</p>
            ) : detailQuery.isError ? (
              <div role="alert">
                <p>No se pudo cargar el registro.</p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => detailQuery.refetch()}
                >
                  Reintentar
                </Button>
              </div>
            ) : detail ? (
              <>
                <div className="partner-detail-heading">
                  <span className="partner-detail-icon">
                    <AddressBook size={20} aria-hidden="true" />
                  </span>
                  <div>
                    <span className="partner-identification" translate="no">
                      {detail.identificationType
                        ? `${detail.identificationType} · `
                        : ""}
                      {detail.identificationNumber}
                    </span>
                    <h3>{displayName(detail, resource)}</h3>
                  </div>
                  <span
                    className={`status-badge${detail.isActive ? " status-badge--active" : " status-badge--inactive"}`}
                  >
                    <span aria-hidden="true" />
                    {detail.isActive ? "Activo" : "Inactivo"}
                  </span>
                </div>
                {resource === "suppliers" && detail.contactName ? (
                  <p className="partner-contact-name">
                    <span>Contacto</span>
                    {detail.contactName}
                  </p>
                ) : null}
                <dl className="warehouse-details partner-details">
                  <div>
                    <dt>Teléfono</dt>
                    <dd>{detail.phone || "Sin teléfono registrado"}</dd>
                  </div>
                  <div>
                    <dt>Correo</dt>
                    <dd>{detail.email || "Sin correo registrado"}</dd>
                  </div>
                  <div>
                    <dt>Dirección</dt>
                    <dd>{detail.address || "Sin dirección registrada"}</dd>
                  </div>
                </dl>
                <p className="partner-detail-updated">
                  Actualizado {formatDate(detail.updatedAt)}
                </p>
              </>
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

export function CustomersPage() {
  return <BusinessPartnersPage resource="customers" />;
}

export function SuppliersPage() {
  return <BusinessPartnersPage resource="suppliers" />;
}
