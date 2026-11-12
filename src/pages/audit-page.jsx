import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowClockwise } from "@phosphor-icons/react/ArrowClockwise";
import { CaretLeft } from "@phosphor-icons/react/CaretLeft";
import { CaretRight } from "@phosphor-icons/react/CaretRight";
import { ClockCounterClockwise } from "@phosphor-icons/react/ClockCounterClockwise";
import { Funnel } from "@phosphor-icons/react/Funnel";
import { X } from "@phosphor-icons/react/X";
import { Button } from "../components/ui/button.jsx";
import { useAuth } from "../auth/auth-context.jsx";
import { ApiError, auditApi } from "../lib/auth-api.js";

const PAGE_SIZE = 20;

const moduleNames = {
  auth: "Acceso",
  categories: "Categorías",
  customers: "Clientes",
  inventory: "Inventario",
  products: "Productos",
  profile: "Perfil",
  purchases: "Compras",
  roles: "Roles",
  sales: "Ventas",
  suppliers: "Proveedores",
  users: "Usuarios",
  warehouses: "Bodegas",
};

const actionNames = {
  "auth.login_failed": "Ingreso rechazado",
  "auth.login_succeeded": "Ingreso exitoso",
  "auth.logout": "Cierre de sesión",
  "auth.password_changed": "Contraseña cambiada",
  "categories.created": "Categoría creada",
  "categories.updated": "Categoría actualizada",
  "categories.activated": "Categoría activada",
  "categories.deactivated": "Categoría desactivada",
  "customers.created": "Cliente creado",
  "customers.updated": "Cliente actualizado",
  "customers.activated": "Cliente activado",
  "customers.deactivated": "Cliente desactivado",
  "inventory.adjustment_in": "Entrada de inventario",
  "inventory.adjustment_out": "Salida de inventario",
  "inventory.customer_return": "Devolución de cliente",
  "inventory.initial_stock": "Existencia inicial",
  "inventory.purchase_receipt": "Recepción de compra",
  "inventory.sale_issue": "Salida por venta",
  "inventory.sale_reversal": "Reversión de venta",
  "inventory.supplier_return": "Devolución a proveedor",
  "inventory.transfer": "Traslado de inventario",
  "products.created": "Producto creado",
  "products.updated": "Producto actualizado",
  "products.activated": "Producto activado",
  "products.deactivated": "Producto desactivado",
  "profile.updated": "Perfil actualizado",
  "purchases.receipt_confirmed": "Recepción de mercancía",
  "purchases.return_confirmed": "Devolución a proveedor",
  "roles.permissions_updated": "Permisos actualizados",
  "sales.confirmed": "Venta confirmada",
  "sales.draft_created": "Borrador creado",
  "sales.draft_updated": "Borrador actualizado",
  "sales.return_confirmed": "Devolución confirmada",
  "sales.reversed": "Venta reversada",
  "suppliers.created": "Proveedor creado",
  "suppliers.updated": "Proveedor actualizado",
  "suppliers.activated": "Proveedor activado",
  "suppliers.deactivated": "Proveedor desactivado",
  "users.activated": "Usuario activado",
  "users.created": "Usuario creado",
  "users.deactivated": "Usuario desactivado",
  "users.password_reset": "Contraseña restablecida",
  "users.updated": "Usuario actualizado",
  "warehouses.activated": "Bodega activada",
  "warehouses.created": "Bodega creada",
  "warehouses.deactivated": "Bodega desactivada",
  "warehouses.updated": "Bodega actualizada",
};

const detailNames = {
  addedPermissionCount: "Permisos agregados",
  addedWarehouseIds: "Bodegas agregadas",
  affectedAccountCount: "Cuentas afectadas",
  allProductsSaleable: "Productos vendibles",
  allQuantitiesPresent: "Cantidades completas",
  code: "Código",
  current: "Valor actual",
  expectedVersion: "Versión esperada",
  fields: "Campos modificados",
  isActive: "Estado activo",
  lineCount: "Líneas del documento",
  method: "Método de acceso",
  name: "Nombre",
  neverDispatched: "Sin despacho",
  operationId: "Operación de Inventario",
  orderId: "Orden de compra",
  passwordChangeRequired: "Cambio de contraseña requerido",
  policyVersion: "Versión de política",
  previous: "Valor anterior",
  receiptId: "Recepción relacionada",
  receivedQuantity: "Cantidad recibida",
  returnedQuantity: "Cantidad devuelta",
  removedPermissionCount: "Permisos retirados",
  removedWarehouseIds: "Bodegas retiradas",
  revokedSessionCount: "Sesiones revocadas",
  revokedSessions: "Sesiones revocadas",
  roleCode: "Rol",
  saleDate: "Fecha del documento",
  sku: "SKU",
  sourceIssueOperationId: "Operación de origen",
  sourceOperationId: "Operación de Inventario",
  total: "Total histórico (COP)",
  version: "Versión actual",
  warehouseId: "Bodega",
  warehouseIds: "Bodegas asignadas",
  warehouses: "Bodegas relacionadas",
};

const roleNames = {
  administrator: "Administrador",
  auditor: "Auditor",
  seller: "Vendedor",
  warehouse: "Bodega",
};

const entityNames = {
  category: "Categoría",
  customer: "Cliente",
  customer_return: "Devolución de cliente",
  inventory_operation: "Operación de inventario",
  product: "Producto",
  purchase_order: "Orden de compra",
  purchase_receipt: "Recepción de mercancía",
  sale: "Venta",
  supplier: "Proveedor",
  supplier_return: "Devolución a proveedor",
  user: "Usuario",
  user_session: "Sesión de usuario",
  warehouse: "Bodega",
};

function todayInBogota() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function defaultFilters() {
  const today = todayInBogota();
  const [year, month, day] = today.split("-").map(Number);
  const from = new Date(0);
  from.setUTCFullYear(year, month - 1, day - 29);
  from.setUTCHours(0, 0, 0, 0);
  return {
    dateFrom: `${String(from.getUTCFullYear()).padStart(4, "0")}-${String(from.getUTCMonth() + 1).padStart(2, "0")}-${String(from.getUTCDate()).padStart(2, "0")}`,
    dateTo: today,
    module: "",
    action: "",
    actorId: "",
    warehouseId: "",
  };
}

function formatDate(value) {
  if (!value) return "Fecha no disponible";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(parsed);
}

function formatCompactDate(value) {
  if (!value) return "Fecha no disponible";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(parsed);
}

function formatExactCop(value) {
  if (typeof value !== "string" || !/^\d{1,63}\.\d{2}$/.test(value))
    return null;
  const [whole, cents] = value.split(".");
  const formatted = new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(BigInt(whole));
  return cents === "00" ? formatted : `${formatted},${cents}`;
}

function formatExactQuantity(value) {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,63})$/.test(value))
    return null;
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(
    BigInt(value),
  );
}

function detailValue(value) {
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? `Bodega #${item}` : null))
      .filter(Boolean)
      .join(", ");
  }
  if (value && typeof value === "object") {
    if ("previous" in value && "current" in value) {
      const previous = roleNames[value.previous] || value.previous;
      const current = roleNames[value.current] || value.current;
      return `${previous} → ${current}`;
    }
    return null;
  }
  if (typeof value === "string" && roleNames[value]) return roleNames[value];
  return value === null || value === undefined ? null : String(value);
}

const fieldNames = {
  address: "Dirección",
  categoryId: "Categoría",
  description: "Descripción",
  displayName: "Nombre para mostrar",
  email: "Correo electrónico",
  identificationNumber: "Identificación",
  isActive: "Estado",
  location: "Ubicación",
  minimumSaleQuantity: "Cantidad mínima de venta",
  minimumStock: "Stock mínimo",
  name: "Nombre",
  phone: "Teléfono",
  purchasePrice: "Precio de compra",
  responsibleUserId: "Responsable",
  salePrice: "Precio de venta",
  sku: "SKU",
  unit: "Unidad de medida",
};

function projectedDetails(details = {}) {
  return Object.entries(details)
    .filter(([key]) => detailNames[key])
    .map(([key, value]) => ({
      key,
      label: detailNames[key],
      value:
        key === "total"
          ? formatExactCop(value)
          : key === "returnedQuantity"
            ? formatExactQuantity(value)
            : key === "fields" && Array.isArray(value)
              ? value
                  .map((field) => fieldNames[field])
                  .filter(Boolean)
                  .join(", ")
              : detailValue(value),
    }))
    .filter(({ value }) => value !== null && value !== "");
}

function describeApiError(error, resource) {
  if (error instanceof ApiError && error.status === 401) {
    return "Tu sesión expiró. Estamos verificando el acceso.";
  }
  if (error instanceof ApiError && error.status === 403) {
    return "Tu permiso para consultar auditoría fue retirado. Actualiza la sesión o solicita acceso al administrador.";
  }
  return resource === "detail"
    ? "No fue posible consultar el evento. Puede que ya no esté disponible para tu alcance."
    : "No fue posible cargar la auditoría. Comprueba la conexión e inténtalo de nuevo.";
}

function DetailDialog({ eventId, scopeKey, onClose, onAuthorizationFailure }) {
  const detailQuery = useQuery({
    queryKey: ["audit-events", scopeKey, "detail", eventId],
    queryFn: async ({ signal }) => {
      try {
        return await auditApi.event(eventId, { signal });
      } catch (error) {
        if (error instanceof ApiError && [401, 403].includes(error.status)) {
          onAuthorizationFailure(error);
        }
        throw error;
      }
    },
    enabled: Boolean(eventId),
    retry: false,
    staleTime: 0,
  });
  const event = detailQuery.data;
  const details = useMemo(
    () => projectedDetails(event?.details),
    [event?.details],
  );

  return (
    <Dialog.Root
      open={Boolean(eventId)}
      onOpenChange={(open) => !open && onClose()}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/35" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[min(85vh,48rem)] w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-white p-5 shadow-panel focus:outline-none sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-semibold text-ink">
                Detalle del evento
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted">
                Información permitida para tu rol y alcance.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button
                variant="secondary"
                className="size-10 shrink-0 px-0"
                aria-label="Cerrar detalle"
              >
                <X size={18} aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </div>
          {detailQuery.isPending ? (
            <p className="mt-6 text-sm text-muted" role="status">
              Cargando detalle…
            </p>
          ) : detailQuery.isError ? (
            <p
              className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
              role="alert"
            >
              {describeApiError(detailQuery.error, "detail")}
            </p>
          ) : event ? (
            <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Fecha y hora
                </dt>
                <dd className="mt-1 text-sm text-ink">
                  {formatDate(event.createdAt)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Acción
                </dt>
                <dd className="mt-1 text-sm text-ink">
                  {actionNames[event.action] || event.action}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Responsable
                </dt>
                <dd className="mt-1 text-sm text-ink">
                  {event.actor?.label || "Sistema"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Entidad
                </dt>
                <dd className="mt-1 text-sm text-ink">
                  {event.entity
                    ? `${entityNames[event.entity.type] || event.entity.type}${event.entity.id ? ` #${event.entity.id}` : ""}`
                    : "No aplica"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Módulo
                </dt>
                <dd className="mt-1 text-sm text-ink">
                  {moduleNames[event.module] || event.module}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Bodegas
                </dt>
                <dd className="mt-1 text-sm text-ink">
                  {event.warehouses?.length
                    ? event.warehouses.map(({ label }) => label).join(", ")
                    : "No aplica"}
                </dd>
              </div>
              {details.map(({ key, label, value }) => (
                <div key={key} className="min-w-0">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                    {label}
                  </dt>
                  <dd className="mt-1 break-words text-sm text-ink">{value}</dd>
                </div>
              ))}
              {event.detailState === "partial" ? (
                <p className="text-sm text-muted sm:col-span-2">
                  El registro original no contiene todos los detalles de esta
                  operación.
                </p>
              ) : null}
              {event.action === "sales.confirmed" && !event.details?.total ? (
                <p className="text-sm text-muted sm:col-span-2">
                  El total histórico de esta venta no está disponible en el
                  registro original.
                </p>
              ) : null}
            </dl>
          ) : null}
          <div className="mt-6 flex justify-end">
            <Dialog.Close asChild>
              <Button variant="secondary">Cerrar</Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default function AuditPage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const permissionScope = [...(session?.permissions || [])].sort();
  const scopeKey = JSON.stringify({
    userId: session?.user?.id,
    role: session?.user?.role,
    permissions: permissionScope,
  });
  const previousScope = useRef(scopeKey);
  const [draftFilters, setDraftFilters] = useState(defaultFilters);
  const [filters, setFilters] = useState(defaultFilters);
  const [cursor, setCursor] = useState(null);
  const [previousCursors, setPreviousCursors] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedScope, setSelectedScope] = useState(scopeKey);
  const [authorizationFailure, setAuthorizationFailure] = useState(null);

  const listQuery = useQuery({
    queryKey: ["audit-events", scopeKey, "list", filters, cursor],
    queryFn: async ({ signal }) => {
      try {
        return await auditApi.list(
          {
            ...filters,
            pageSize: PAGE_SIZE,
            cursor: cursor || undefined,
          },
          { signal },
        );
      } catch (error) {
        if (error instanceof ApiError && [401, 403].includes(error.status)) {
          setAuthorizationFailure(describeApiError(error, "list"));
        }
        throw error;
      }
    },
    retry: false,
    enabled: !authorizationFailure,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const optionsQuery = useQuery({
    queryKey: ["audit-events", scopeKey, "options", filters],
    queryFn: async ({ signal }) => {
      try {
        return await auditApi.options(filters, { signal });
      } catch (error) {
        if (error instanceof ApiError && [401, 403].includes(error.status)) {
          setAuthorizationFailure(describeApiError(error, "list"));
        }
        throw error;
      }
    },
    enabled: !listQuery.isFetching && !authorizationFailure,
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const authorizationError = [listQuery.error, optionsQuery.error].find(
    (error) => error instanceof ApiError && [401, 403].includes(error.status),
  );
  const accessError = authorizationError;

  useEffect(() => {
    if (previousScope.current === scopeKey) return;
    const staleScope = previousScope.current;
    previousScope.current = scopeKey;
    void queryClient.cancelQueries({
      predicate: (query) =>
        query.queryKey[0] === "audit-events" &&
        query.queryKey[1] === staleScope,
    });
    queryClient.removeQueries({
      predicate: (query) =>
        query.queryKey[0] === "audit-events" &&
        query.queryKey[1] === staleScope,
    });
    setSelectedId(null);
    setCursor(null);
    setPreviousCursors([]);
    const freshFilters = defaultFilters();
    setAuthorizationFailure(null);
    setDraftFilters(freshFilters);
    setFilters(freshFilters);
  }, [queryClient, scopeKey]);

  const options = optionsQuery.data || {
    modules: [],
    actions: [],
    actors: [],
    warehouses: [],
  };
  const items =
    authorizationFailure || authorizationError
      ? []
      : listQuery.data?.items || [];
  const statusError = authorizationFailure
    ? authorizationFailure
    : accessError
      ? describeApiError(accessError, "list")
      : listQuery.error
        ? describeApiError(listQuery.error, "list")
        : null;

  function changeDraft(key, value) {
    setDraftFilters((current) => ({ ...current, [key]: value }));
  }

  function applyFilters(nextFilters = draftFilters) {
    setSelectedId(null);
    setSelectedScope(scopeKey);
    setPreviousCursors([]);
    setCursor(null);
    setFilters({ ...nextFilters });
  }

  function clearFilters() {
    const freshFilters = defaultFilters();
    setDraftFilters(freshFilters);
    applyFilters(freshFilters);
  }

  const clearAuditDataForAuthorizationChange = useCallback(() => {
    void queryClient.cancelQueries({
      predicate: (query) => query.queryKey[0] === "audit-events",
    });
    queryClient.removeQueries({
      predicate: (query) => query.queryKey[0] === "audit-events",
    });
  }, [queryClient]);

  const reportAuthorizationFailure = useCallback((error) => {
    setAuthorizationFailure(describeApiError(error, "list"));
  }, []);

  useEffect(() => {
    if (!accessError && !authorizationFailure) return;
    clearAuditDataForAuthorizationChange();
  }, [accessError, authorizationFailure, clearAuditDataForAuthorizationChange]);

  async function refreshCurrent() {
    await listQuery.refetch();
    if (!authorizationError) await optionsQuery.refetch();
  }

  function nextPage() {
    const nextCursor = listQuery.data?.pagination?.nextCursor;
    if (!nextCursor) return;
    setPreviousCursors((current) => [...current, cursor]);
    setCursor(nextCursor);
  }

  function previousPage() {
    if (!previousCursors.length) return;
    setCursor(previousCursors.at(-1));
    setPreviousCursors((current) => current.slice(0, -1));
  }

  return (
    <main className="page-content space-y-6">
      <header className="page-header">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Auditoría</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Consulta las acciones registradas según tu rol y las bodegas que
            tienes asignadas.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => void refreshCurrent()}
          disabled={listQuery.isFetching || optionsQuery.isFetching}
        >
          <ArrowClockwise size={17} aria-hidden="true" />
          Actualizar
        </Button>
      </header>

      <section
        className="rounded-xl border border-border bg-white p-4 shadow-sm sm:p-5"
        aria-label="Filtros de auditoría"
      >
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink">
          <Funnel size={17} aria-hidden="true" />
          Filtrar eventos
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <label className="grid gap-1.5 text-sm font-medium text-ink">
            Desde
            <input
              className="h-10 min-w-0 rounded-lg border border-border px-3 text-sm font-normal"
              type="date"
              value={draftFilters.dateFrom}
              onChange={(event) => changeDraft("dateFrom", event.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-ink">
            Hasta
            <input
              className="h-10 min-w-0 rounded-lg border border-border px-3 text-sm font-normal"
              type="date"
              value={draftFilters.dateTo}
              onChange={(event) => changeDraft("dateTo", event.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-ink">
            Módulo
            <select
              className="h-10 min-w-0 rounded-lg border border-border bg-white px-3 text-sm font-normal"
              value={draftFilters.module}
              onChange={(event) => changeDraft("module", event.target.value)}
            >
              <option value="">Todos los módulos</option>
              {options.modules.map((module) => (
                <option key={module} value={module}>
                  {moduleNames[module] || module}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-ink">
            Acción
            <select
              className="h-10 min-w-0 rounded-lg border border-border bg-white px-3 text-sm font-normal"
              value={draftFilters.action}
              onChange={(event) => changeDraft("action", event.target.value)}
            >
              <option value="">Todas las acciones</option>
              {options.actions.map((action) => (
                <option key={action} value={action}>
                  {actionNames[action] || action}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-ink">
            Responsable
            <select
              className="h-10 min-w-0 rounded-lg border border-border bg-white px-3 text-sm font-normal"
              value={draftFilters.actorId}
              onChange={(event) => changeDraft("actorId", event.target.value)}
            >
              <option value="">Todos</option>
              {options.actors.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-ink">
            Bodega
            <select
              className="h-10 min-w-0 rounded-lg border border-border bg-white px-3 text-sm font-normal"
              value={draftFilters.warehouseId}
              onChange={(event) =>
                changeDraft("warehouseId", event.target.value)
              }
            >
              <option value="">Todas las autorizadas</option>
              {options.warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {optionsQuery.isFetching ? (
          <p className="mt-3 text-xs text-muted" role="status">
            Actualizando opciones disponibles…
          </p>
        ) : null}
        {optionsQuery.isError && !accessError ? (
          <p className="mt-3 text-sm text-amber-900" role="status">
            No se pudieron actualizar las opciones de filtros. Puedes consultar
            con los filtros actuales.
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={clearFilters}>
            Limpiar
          </Button>
          <Button
            onClick={() => applyFilters()}
            disabled={listQuery.isFetching}
          >
            Aplicar filtros
          </Button>
        </div>
      </section>

      <section
        className="overflow-hidden rounded-xl border border-border bg-white shadow-sm"
        aria-label="Eventos de auditoría"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
          <div>
            <h2 className="font-semibold text-ink">Eventos registrados</h2>
            <p className="mt-1 text-sm text-muted">
              Los resultados respetan el alcance de tu cuenta.
            </p>
          </div>
          {listQuery.data ? (
            <span className="text-sm tabular-nums text-muted">
              {items.length} en esta página
            </span>
          ) : null}
        </div>
        {listQuery.isPending ? (
          <p className="p-6 text-sm text-muted" role="status">
            Cargando eventos de auditoría…
          </p>
        ) : statusError ? (
          <div
            className="m-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 sm:m-5"
            role="alert"
          >
            <p>{statusError}</p>
            {!accessError ? (
              <Button
                variant="secondary"
                onClick={() => void listQuery.refetch()}
              >
                Reintentar
              </Button>
            ) : null}
          </div>
        ) : items.length ? (
          <div className="overflow-x-auto">
            <table className="w-full table-fixed border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <th className="w-[7.5rem] px-2 py-3 xl:w-auto xl:px-5">
                    Fecha
                  </th>
                  <th className="w-[30%] px-2 py-3 sm:px-4 xl:w-auto">
                    Acción
                  </th>
                  <th className="hidden px-4 py-3 lg:table-cell">Módulo</th>
                  <th className="w-[25%] px-2 py-3 sm:px-4 xl:w-auto">
                    Responsable
                  </th>
                  <th className="hidden px-4 py-3 xl:table-cell">Entidad</th>
                  <th className="hidden w-28 px-4 py-3 text-right xl:table-cell xl:w-auto xl:px-5">
                    Detalle
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item) => (
                  <tr key={item.id} className="align-middle text-ink">
                    <td className="break-words px-2 py-3.5 text-xs text-muted sm:whitespace-nowrap sm:px-5 sm:text-sm">
                      <span className="sm:hidden">
                        {formatCompactDate(item.createdAt)}
                      </span>
                      <span className="hidden sm:inline">
                        {formatDate(item.createdAt)}
                      </span>
                    </td>
                    <td className="break-words px-2 py-3.5 text-xs font-medium sm:max-w-56 sm:px-4 sm:text-sm">
                      {actionNames[item.action] || item.action}
                    </td>
                    <td className="hidden px-4 py-3.5 text-muted lg:table-cell">
                      {moduleNames[item.module] || item.module}
                    </td>
                    <td className="break-words px-2 py-3.5 text-xs sm:px-4 sm:text-sm">
                      {item.actor?.label || "Sistema"}
                      <Button
                        variant="ghost"
                        className="mt-1 block min-h-8 px-0 text-xs text-interactive xl:hidden"
                        onClick={() => {
                          setSelectedScope(scopeKey);
                          setSelectedId(item.id);
                        }}
                        aria-label={`Ver detalle del evento ${item.id}`}
                      >
                        Ver detalle
                      </Button>
                    </td>
                    <td className="hidden px-4 py-3.5 text-muted xl:table-cell">
                      {item.entity
                        ? `${entityNames[item.entity.type] || item.entity.type}${item.entity.id ? ` #${item.entity.id}` : ""}`
                        : "—"}
                    </td>
                    <td className="hidden px-4 py-3.5 text-right xl:table-cell xl:px-5">
                      <Button
                        variant="secondary"
                        className="min-h-9 px-3"
                        onClick={() => {
                          setSelectedScope(scopeKey);
                          setSelectedId(item.id);
                        }}
                        aria-label={`Ver detalle del evento ${item.id}`}
                      >
                        Ver detalle
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center px-5 py-12 text-center">
            <ClockCounterClockwise
              size={26}
              className="text-muted"
              aria-hidden="true"
            />
            <h3 className="mt-3 font-semibold text-ink">
              No hay eventos para los filtros seleccionados.
            </h3>
            <p className="mt-1 max-w-md text-sm leading-6 text-muted">
              Ajusta el período o elimina alguno de los filtros para ampliar la
              consulta.
            </p>
          </div>
        )}
        {!statusError && items.length ? (
          <nav
            className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-5"
            aria-label="Paginación de auditoría"
          >
            <Button
              variant="secondary"
              onClick={previousPage}
              disabled={!previousCursors.length || listQuery.isFetching}
            >
              <CaretLeft size={16} aria-hidden="true" />
              Anterior
            </Button>
            <span className="text-xs text-muted">
              {previousCursors.length
                ? `Página ${previousCursors.length + 1}`
                : "Página 1"}
            </span>
            <Button
              variant="secondary"
              onClick={nextPage}
              disabled={
                !listQuery.data?.pagination?.nextCursor || listQuery.isFetching
              }
            >
              Siguiente
              <CaretRight size={16} aria-hidden="true" />
            </Button>
          </nav>
        ) : null}
      </section>

      <DetailDialog
        key={`${scopeKey}:${selectedId || "closed"}`}
        eventId={
          !authorizationFailure && selectedScope === scopeKey
            ? selectedId
            : null
        }
        scopeKey={scopeKey}
        onClose={() => setSelectedId(null)}
        onAuthorizationFailure={reportAuthorizationFailure}
      />
    </main>
  );
}
