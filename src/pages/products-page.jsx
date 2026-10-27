import { useCallback, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { createColumnHelper } from "@tanstack/react-table";
import * as Dialog from "@radix-ui/react-dialog";
import { Check } from "@phosphor-icons/react/Check";
import { Eye } from "@phosphor-icons/react/Eye";
import { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { Package } from "@phosphor-icons/react/Package";
import { PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { Plus } from "@phosphor-icons/react/Plus";
import { Power } from "@phosphor-icons/react/Power";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";
import DataTable, { SortableHeading } from "../components/data-table.jsx";
import { Button } from "../components/ui/button.jsx";
import { Input } from "../components/ui/input.jsx";
import { useAuth } from "../auth/auth-context.jsx";
import { ApiError, categoriesApi, productsApi } from "../lib/auth-api.js";

const pageSizeOptions = [10, 25, 50];
const units = [
  ["unidad", "Unidad"],
  ["caja", "Caja"],
  ["paquete", "Paquete"],
  ["docena", "Docena"],
  ["display", "Display"],
  ["bulto", "Bulto"],
  ["par", "Par"],
];
const moneyPattern =
  /^(?:(?:0|[1-9]\d{0,12})(?:[.,]\d{1,2})?|[1-9]\d{0,2}(?:\.\d{3})+(?:,\d{1,2})?)$/;
const integerPattern = /^(?:0|[1-9]\d{0,9})$/;
const moneyFieldSchema = z
  .string()
  .regex(moneyPattern, "Usa un precio válido con máximo dos decimales.")
  .transform((value) => {
    if (value.includes(",")) {
      return value.replaceAll(".", "").replace(",", ".");
    }
    if (/^[1-9]\d{0,2}(?:\.\d{3})+$/.test(value)) {
      return value.replaceAll(".", "");
    }
    return value;
  })
  .refine(
    (value) => BigInt(value.split(".")[0]) <= 9_999_999_999_999n,
    "El precio excede el máximo permitido.",
  );
const formSchema = z
  .object({
    sku: z
      .string()
      .trim()
      .min(1, "Escribe el SKU del producto.")
      .max(64)
      .regex(
        /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/,
        "Usa letras, números, punto, guion o guion bajo.",
      ),
    name: z.string().trim().min(1, "Escribe el nombre del producto.").max(160),
    description: z
      .string()
      .trim()
      .max(500, "La descripción no puede superar 500 caracteres."),
    categoryId: z.string().min(1, "Selecciona una categoría activa."),
    unit: z.enum([
      "unidad",
      "caja",
      "paquete",
      "docena",
      "display",
      "bulto",
      "par",
    ]),
    purchasePrice: moneyFieldSchema,
    salePrice: moneyFieldSchema,
    minimumSaleEnabled: z.boolean(),
    minimumSaleQuantity: z.string(),
    minimumStock: z
      .string()
      .regex(integerPattern, "El stock mínimo debe ser un entero no negativo.")
      .refine(
        (value) => Number(value) <= 4_294_967_295,
        "El valor excede el máximo permitido.",
      ),
  })
  .superRefine((values, context) => {
    if (
      values.minimumSaleEnabled &&
      (!/^[1-9]\d{0,9}$/.test(values.minimumSaleQuantity) ||
        Number(values.minimumSaleQuantity) > 4_294_967_295)
    ) {
      context.addIssue({
        code: "custom",
        path: ["minimumSaleQuantity"],
        message: "Indica una cantidad mínima entera mayor que cero.",
      });
    }
  });

const columnHelper = createColumnHelper();
const listQueryKey = ["products", "list"];

function queryNumber(value, fallback, maximum) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= maximum
    ? number
    : fallback;
}

function formatMoney(value) {
  const [whole = "0", fraction = ""] = String(value ?? "0").split(".");
  const wholeCurrency = new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(BigInt(whole));
  return `${wholeCurrency},${fraction.padEnd(2, "0")}`;
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(new Date(value));
}

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session } = useAuth();
  const canManage = session.permissions.includes("products.manage");
  const canReadInventory = session.permissions.includes("inventory.read");
  const page = queryNumber(searchParams.get("page"), 1, 1_000_000);
  const pageSize = pageSizeOptions.includes(
    Number(searchParams.get("pageSize")),
  )
    ? Number(searchParams.get("pageSize"))
    : 10;
  const query = searchParams.get("q") || "";
  const categoryId = searchParams.get("categoryId") || "";
  const status = ["active", "inactive"].includes(searchParams.get("status"))
    ? searchParams.get("status")
    : "all";
  const sortBy = [
    "sku",
    "name",
    "category",
    "salePrice",
    "status",
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

  const categoryQuery = useQuery({
    queryKey: ["categories", "product-selector"],
    queryFn: () =>
      categoriesApi.list({
        page: 1,
        pageSize: 100,
        status: "all",
        sortBy: "name",
      }),
    retry: false,
  });
  const listQuery = useQuery({
    queryKey: [
      ...listQueryKey,
      { page, pageSize, q: query, categoryId, status, sortBy, sortOrder },
    ],
    queryFn: () =>
      productsApi.list({
        page,
        pageSize,
        q: query,
        categoryId,
        status,
        sortBy,
        sortOrder,
      }),
    retry: false,
  });
  const detailsQuery = useQuery({
    queryKey: ["products", "detail", detailsId],
    queryFn: () => productsApi.get(detailsId),
    enabled: Boolean(detailsId),
    retry: false,
  });
  const balancesQuery = useQuery({
    queryKey: ["products", "balances", detailsId],
    queryFn: () => productsApi.balances(detailsId),
    enabled: Boolean(detailsId) && canReadInventory,
    retry: false,
  });

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      sku: "",
      name: "",
      description: "",
      categoryId: "",
      unit: "unidad",
      purchasePrice: "",
      salePrice: "",
      minimumSaleEnabled: false,
      minimumSaleQuantity: "",
      minimumStock: "0",
    },
  });
  const minimumSaleEnabled = useWatch({
    control: form.control,
    name: "minimumSaleEnabled",
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
    form.reset({
      sku: "",
      name: "",
      description: "",
      categoryId: "",
      unit: "unidad",
      purchasePrice: "",
      salePrice: "",
      minimumSaleEnabled: false,
      minimumSaleQuantity: "",
      minimumStock: "0",
    });
    setFormOpen(true);
  }

  const openEdit = useCallback(
    (product) => {
      setEditing(product);
      form.reset({
        sku: product.sku,
        name: product.name,
        description: product.description || "",
        categoryId: product.categoryId,
        unit: product.unit,
        purchasePrice: product.purchasePrice,
        salePrice: product.salePrice,
        minimumSaleEnabled: product.minimumSaleEnabled,
        minimumSaleQuantity:
          product.minimumSaleQuantity === null
            ? ""
            : String(product.minimumSaleQuantity),
        minimumStock: String(product.minimumStock),
      });
      setFormOpen(true);
    },
    [form],
  );

  const saveMutation = useMutation({
    mutationFn: (values) => {
      const input = {
        sku: values.sku.trim().toUpperCase(),
        name: values.name.trim(),
        description: values.description.trim() || null,
        categoryId: values.categoryId,
        unit: values.unit,
        purchasePrice: values.purchasePrice,
        salePrice: values.salePrice,
        minimumSaleEnabled: values.minimumSaleEnabled,
        minimumSaleQuantity: values.minimumSaleEnabled
          ? Number(values.minimumSaleQuantity)
          : null,
        minimumStock: Number(values.minimumStock),
        isActive: editing?.isActive ?? true,
      };
      return editing
        ? productsApi.update(editing.id, input)
        : productsApi.create(input);
    },
    onSuccess: async () => {
      setFormOpen(false);
      toast.success(editing ? "Producto actualizado." : "Producto creado.");
      await queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "PRODUCT_SKU_TAKEN") {
        form.setError("sku", { message: "Ya existe un producto con ese SKU." });
        return;
      }
      if (
        error instanceof ApiError &&
        error.code === "INACTIVE_PRODUCT_CATEGORY"
      ) {
        form.setError("categoryId", {
          message: "Selecciona una categoría activa.",
        });
        return;
      }
      toast.error(error.message || "No se pudo guardar el producto.");
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ product, isActive }) =>
      productsApi.update(product.id, {
        sku: product.sku,
        name: product.name,
        description: product.description,
        categoryId: product.categoryId,
        unit: product.unit,
        purchasePrice: product.purchasePrice,
        salePrice: product.salePrice,
        minimumSaleEnabled: product.minimumSaleEnabled,
        minimumSaleQuantity: product.minimumSaleQuantity,
        minimumStock: product.minimumStock,
        isActive,
      }),
    onSuccess: async (_product, { isActive }) => {
      setConfirming(null);
      toast.success(isActive ? "Producto activado." : "Producto desactivado.");
      await queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (error) =>
      toast.error(
        error.message || "No se pudo cambiar el estado del producto.",
      ),
  });

  const columns = useMemo(() => {
    const base = [
      columnHelper.accessor("sku", {
        header: ({ column }) => (
          <SortableHeading column={column}>SKU</SortableHeading>
        ),
        cell: (info) => (
          <span className="table-primary-cell product-sku" translate="no">
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor("name", {
        header: ({ column }) => (
          <SortableHeading column={column}>Producto</SortableHeading>
        ),
        cell: (info) => (
          <span className="table-primary-cell">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor("categoryName", {
        id: "category",
        header: ({ column }) => (
          <SortableHeading column={column}>Categoría</SortableHeading>
        ),
      }),
      columnHelper.accessor("salePrice", {
        id: "salePrice",
        header: ({ column }) => (
          <SortableHeading column={column}>Precio de venta</SortableHeading>
        ),
        cell: (info) => (
          <span className="product-money">{formatMoney(info.getValue())}</span>
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
            {info.getValue() ? "Activo" : "Inactivo"}
          </span>
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
              aria-label={`Ver producto ${row.original.sku}`}
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
                  aria-label={`Editar ${row.original.sku}`}
                  onClick={() => openEdit(row.original)}
                >
                  <PencilSimple size={17} aria-hidden="true" />
                </Button>
                <Button
                  className="table-icon-button"
                  variant="ghost"
                  type="button"
                  aria-label={`${row.original.isActive ? "Desactivar" : "Activar"} ${row.original.sku}`}
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
  const hasActiveFilters = Boolean(query || categoryId) || status !== "all";

  function submitSearch(event) {
    event.preventDefault();
    updateSearchParams({ q: searchInput.trim(), page: null });
  }

  function submitForm(values) {
    saveMutation.mutate(values);
  }

  const categories = categoryQuery.data?.items || [];
  const activeCategories = categories.filter((category) => category.isActive);
  const product = detailsQuery.data;

  return (
    <section className="categories-page" aria-labelledby="products-title">
      <div className="module-heading">
        <div>
          <h2 id="products-title">Productos</h2>
          <p>
            Administra el catálogo, los precios y la configuración comercial.
          </p>
        </div>
        {canManage ? (
          <Button type="button" onClick={openCreate}>
            <Plus size={18} aria-hidden="true" />
            Nuevo producto
          </Button>
        ) : null}
      </div>

      <section className="module-panel" aria-label="Listado de productos">
        <form className="table-toolbar" onSubmit={submitSearch} role="search">
          <label className="table-search" htmlFor="product-search">
            <MagnifyingGlass size={18} aria-hidden="true" />
            <Input
              id="product-search"
              name="q"
              type="search"
              autoComplete="off"
              placeholder="Buscar por nombre o SKU…"
              aria-label="Buscar productos por nombre o SKU"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </label>
          <div className="table-toolbar__filters">
            <label className="filter-control" htmlFor="product-category-filter">
              <span>Categoría</span>
              <select
                id="product-category-filter"
                value={categoryId}
                onChange={(event) =>
                  updateSearchParams({
                    categoryId: event.target.value,
                    page: null,
                  })
                }
              >
                <option value="">Todas</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-control" htmlFor="product-status-filter">
              <span>Estado</span>
              <select
                id="product-status-filter"
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
              htmlFor="product-page-size"
            >
              <span>Filas</span>
              <select
                id="product-page-size"
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
            <h3>No se pudieron cargar los productos</h3>
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
            regionLabel="Productos"
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
            loadingLabel="Cargando productos…"
            emptyLabel={
              hasActiveFilters
                ? "No hay productos que coincidan con estos filtros."
                : "Aún no hay productos."
            }
            emptyState={
              !hasActiveFilters && canManage ? (
                <div className="empty-content">
                  <span className="products-empty-icon">
                    <Package size={24} aria-hidden="true" />
                  </span>
                  <h3>Aún no hay productos</h3>
                  <p>
                    Registra el catálogo comercial para consultar productos y
                    precios.
                  </p>
                  <Button type="button" onClick={openCreate}>
                    <Plus size={17} aria-hidden="true" />
                    Crear producto
                  </Button>
                </div>
              ) : undefined
            }
          />
        )}

        {result?.pagination.total > 0 ? (
          <div
            className="table-pagination"
            aria-label="Paginación de productos"
          >
            <p>
              {result.pagination.total === 1
                ? "1 producto"
                : `${result.pagination.total} productos`}
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
            className="module-dialog module-dialog--product"
            aria-describedby="product-form-description"
          >
            <Dialog.Title className="module-dialog__title">
              {editing ? "Editar producto" : "Nuevo producto"}
            </Dialog.Title>
            <Dialog.Description
              id="product-form-description"
              className="module-dialog__description"
            >
              Completa el catálogo y la configuración comercial. Las existencias
              se administran desde Inventario.
            </Dialog.Description>
            <form
              className="module-form product-form"
              onSubmit={form.handleSubmit(submitForm)}
              noValidate
            >
              <fieldset className="product-form-section">
                <legend>Información general</legend>
                <div className="product-form-grid">
                  <div className="form-field">
                    <label htmlFor="product-sku">SKU</label>
                    <Input
                      id="product-sku"
                      autoComplete="off"
                      maxLength={64}
                      aria-invalid={Boolean(form.formState.errors.sku)}
                      {...form.register("sku")}
                    />
                    {form.formState.errors.sku ? (
                      <span className="field-error" role="alert">
                        {form.formState.errors.sku.message}
                      </span>
                    ) : null}
                  </div>
                  <div className="form-field">
                    <label htmlFor="product-name">Nombre</label>
                    <Input
                      id="product-name"
                      autoComplete="off"
                      maxLength={160}
                      aria-invalid={Boolean(form.formState.errors.name)}
                      {...form.register("name")}
                    />
                    {form.formState.errors.name ? (
                      <span className="field-error" role="alert">
                        {form.formState.errors.name.message}
                      </span>
                    ) : null}
                  </div>
                  <div className="form-field">
                    <label htmlFor="product-category">Categoría</label>
                    <select
                      className="module-select"
                      id="product-category"
                      aria-invalid={Boolean(form.formState.errors.categoryId)}
                      {...form.register("categoryId")}
                    >
                      <option value="">Selecciona una categoría</option>
                      {activeCategories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                    {categoryQuery.isError ? (
                      <span className="field-error" role="alert">
                        No se pudieron cargar las categorías.
                      </span>
                    ) : null}
                    {form.formState.errors.categoryId ? (
                      <span className="field-error" role="alert">
                        {form.formState.errors.categoryId.message}
                      </span>
                    ) : null}
                  </div>
                  <div className="form-field">
                    <label htmlFor="product-unit">Unidad comercial</label>
                    <select
                      className="module-select"
                      id="product-unit"
                      {...form.register("unit")}
                    >
                      {units.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <span className="field-hint">
                      Las cantidades se registran en unidades enteras, sin
                      conversiones.
                    </span>
                  </div>
                  <div className="form-field product-form-grid__wide">
                    <label htmlFor="product-description">
                      Descripción <span>(opcional)</span>
                    </label>
                    <textarea
                      className="module-textarea"
                      id="product-description"
                      rows={2}
                      maxLength={500}
                      {...form.register("description")}
                    />
                  </div>
                </div>
              </fieldset>
              <fieldset className="product-form-section">
                <legend>Precios</legend>
                <div className="product-form-grid">
                  <div className="form-field">
                    <label htmlFor="product-purchase-price">
                      Precio de compra <span>(COP)</span>
                    </label>
                    <Input
                      id="product-purchase-price"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0,00"
                      aria-invalid={Boolean(
                        form.formState.errors.purchasePrice,
                      )}
                      {...form.register("purchasePrice")}
                    />
                    {form.formState.errors.purchasePrice ? (
                      <span className="field-error" role="alert">
                        {form.formState.errors.purchasePrice.message}
                      </span>
                    ) : null}
                  </div>
                  <div className="form-field">
                    <label htmlFor="product-sale-price">
                      Precio de venta <span>(COP)</span>
                    </label>
                    <Input
                      id="product-sale-price"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0,00"
                      aria-invalid={Boolean(form.formState.errors.salePrice)}
                      {...form.register("salePrice")}
                    />
                    {form.formState.errors.salePrice ? (
                      <span className="field-error" role="alert">
                        {form.formState.errors.salePrice.message}
                      </span>
                    ) : null}
                    <span className="field-hint">
                      Admite coma decimal y máximo dos cifras decimales.
                    </span>
                  </div>
                </div>
              </fieldset>
              <fieldset className="product-form-section">
                <legend>Configuración comercial</legend>
                <label
                  className="product-toggle"
                  htmlFor="minimum-sale-enabled"
                >
                  <input
                    id="minimum-sale-enabled"
                    type="checkbox"
                    {...form.register("minimumSaleEnabled", {
                      onChange: (event) => {
                        if (!event.target.checked)
                          form.setValue("minimumSaleQuantity", "", {
                            shouldValidate: true,
                          });
                      },
                    })}
                  />
                  <span>
                    <strong>Aplicar cantidad mínima de venta</strong>
                    <small>
                      Desactivada por defecto. La regla se aplicará al confirmar
                      ventas.
                    </small>
                  </span>
                </label>
                {minimumSaleEnabled ? (
                  <div className="form-field product-quantity-field">
                    <label htmlFor="minimum-sale-quantity">
                      Cantidad mínima de venta <span>(entera)</span>
                    </label>
                    <Input
                      id="minimum-sale-quantity"
                      inputMode="numeric"
                      autoComplete="off"
                      aria-invalid={Boolean(
                        form.formState.errors.minimumSaleQuantity,
                      )}
                      {...form.register("minimumSaleQuantity")}
                    />
                    {form.formState.errors.minimumSaleQuantity ? (
                      <span className="field-error" role="alert">
                        {form.formState.errors.minimumSaleQuantity.message}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                <div className="form-field product-quantity-field">
                  <label htmlFor="minimum-stock">
                    Stock mínimo <span>(entero)</span>
                  </label>
                  <Input
                    id="minimum-stock"
                    inputMode="numeric"
                    autoComplete="off"
                    aria-invalid={Boolean(form.formState.errors.minimumStock)}
                    {...form.register("minimumStock")}
                  />
                  {form.formState.errors.minimumStock ? (
                    <span className="field-error" role="alert">
                      {form.formState.errors.minimumStock.message}
                    </span>
                  ) : null}
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
                <Button
                  type="submit"
                  disabled={saveMutation.isPending || categoryQuery.isPending}
                >
                  {saveMutation.isPending ? (
                    "Guardando…"
                  ) : editing ? (
                    <>
                      <Check size={17} aria-hidden="true" />
                      Guardar cambios
                    </>
                  ) : (
                    "Crear producto"
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
            aria-describedby="product-status-description"
          >
            <Dialog.Title className="module-dialog__title">
              {confirming?.isActive
                ? "Desactivar producto"
                : "Activar producto"}
            </Dialog.Title>
            <Dialog.Description
              id="product-status-description"
              className="module-dialog__description"
            >
              {confirming?.isActive
                ? `“${confirming.name}” dejará de estar disponible para nuevas operaciones. Su historial se conservará.`
                : `“${confirming?.name}” volverá a estar disponible en el catálogo.`}
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
                    product: confirming,
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
            className="module-dialog module-dialog--product"
            aria-describedby="product-detail-description"
          >
            <Dialog.Title className="module-dialog__title">
              Detalle del producto
            </Dialog.Title>
            <Dialog.Description
              id="product-detail-description"
              className="module-dialog__description"
            >
              Consulta la ficha comercial y las existencias de bodegas
              autorizadas.
            </Dialog.Description>
            {detailsQuery.isPending ? (
              <p role="status">Cargando detalle…</p>
            ) : detailsQuery.isError ? (
              <div role="alert">
                <p>No se pudo cargar el producto.</p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => detailsQuery.refetch()}
                >
                  Reintentar
                </Button>
              </div>
            ) : product ? (
              <>
                <div className="product-detail-heading">
                  <span className="product-detail-icon">
                    <Package size={20} aria-hidden="true" />
                  </span>
                  <div>
                    <span className="product-sku" translate="no">
                      {product.sku}
                    </span>
                    <h3>{product.name}</h3>
                  </div>
                  <span
                    className={`status-badge${product.isActive ? " status-badge--active" : " status-badge--inactive"}`}
                  >
                    <span aria-hidden="true" />
                    {product.isActive ? "Activo" : "Inactivo"}
                  </span>
                </div>
                <dl className="warehouse-details product-details">
                  <div>
                    <dt>Categoría</dt>
                    <dd>{product.categoryName}</dd>
                  </div>
                  <div>
                    <dt>Unidad comercial</dt>
                    <dd>
                      {units.find(([unit]) => unit === product.unit)?.[1] ||
                        product.unit}
                    </dd>
                  </div>
                  <div>
                    <dt>Precio de compra</dt>
                    <dd>{formatMoney(product.purchasePrice)}</dd>
                  </div>
                  <div>
                    <dt>Precio de venta</dt>
                    <dd>{formatMoney(product.salePrice)}</dd>
                  </div>
                  <div>
                    <dt>Cantidad mínima</dt>
                    <dd>
                      {product.minimumSaleEnabled
                        ? `${product.minimumSaleQuantity} ${product.minimumSaleQuantity === 1 ? "unidad" : "unidades"}`
                        : "Desactivada"}
                    </dd>
                  </div>
                  <div>
                    <dt>Stock mínimo</dt>
                    <dd>
                      {product.minimumStock}{" "}
                      {product.minimumStock === 1 ? "unidad" : "unidades"}
                    </dd>
                  </div>
                  <div>
                    <dt>Descripción</dt>
                    <dd>{product.description || "Sin descripción"}</dd>
                  </div>
                </dl>
                {canReadInventory ? (
                  <section
                    className="product-balances"
                    aria-labelledby="product-balances-title"
                  >
                    <h3 id="product-balances-title">Existencias por bodega</h3>
                    {balancesQuery.isPending ? (
                      <p role="status">Consultando existencias…</p>
                    ) : balancesQuery.isError ? (
                      <div role="alert">
                        <p>No se pudieron consultar las existencias.</p>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => balancesQuery.refetch()}
                        >
                          Reintentar
                        </Button>
                      </div>
                    ) : balancesQuery.data?.items.length ? (
                      <ul>
                        {balancesQuery.data.items.map((balance) => (
                          <li key={balance.warehouseId}>
                            <span>{balance.warehouseName}</span>
                            <strong>
                              {balance.hasBalance
                                ? `${balance.quantity} ${balance.quantity === 1 ? "unidad" : "unidades"}`
                                : "Sin saldo registrado"}
                            </strong>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>No tienes bodegas activas asignadas para consultar.</p>
                    )}
                  </section>
                ) : null}
                <p className="product-detail-updated">
                  Actualizado {formatDate(product.updatedAt)}
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
