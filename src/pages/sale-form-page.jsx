import { useEffect, useMemo, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { Plus } from "@phosphor-icons/react/Plus";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "../components/ui/button.jsx";
import { Input } from "../components/ui/input.jsx";
import {
  ApiError,
  customersApi,
  productsApi,
  salesApi,
  warehousesApi,
} from "../lib/auth-api.js";

const moneyPattern = /^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/;
const emptyLines = [];
const schema = z.object({
  customerId: z.string().min(1, "Selecciona un cliente activo."),
  warehouseId: z.string().min(1, "Selecciona una bodega autorizada."),
  saleDate: z.string().min(1, "Indica la fecha de la venta."),
  notes: z.string().max(1000, "Máximo 1000 caracteres."),
  lines: z
    .array(
      z
        .object({
          productId: z.string(),
          sku: z.string(),
          name: z.string(),
          unit: z.string(),
          minimumSaleEnabled: z.boolean(),
          minimumSaleQuantity: z.number().nullable(),
          quantity: z
            .number()
            .int()
            .min(1, "La cantidad debe ser al menos 1.")
            .max(4_294_967_295),
          unitPrice: z
            .string()
            .regex(
              moneyPattern,
              "Ingresa un precio válido con máximo dos decimales.",
            )
            .refine(
              (value) => /[1-9]/.test(value),
              "El precio debe ser mayor que cero.",
            ),
        })
        .superRefine((line, context) => {
          if (
            line.minimumSaleEnabled &&
            line.quantity < line.minimumSaleQuantity
          )
            context.addIssue({
              code: "custom",
              path: ["quantity"],
              message: `La cantidad mínima es ${line.minimumSaleQuantity}.`,
            });
        }),
    )
    .min(1, "Agrega al menos un producto.")
    .max(50, "Una venta admite hasta 50 productos distintos.")
    .refine(
      (lines) =>
        new Set(lines.map((line) => line.productId)).size === lines.length,
      "No repitas productos en la venta.",
    ),
});

function todayInBogota() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
  }).format(new Date());
}

function asCents(value) {
  if (!moneyPattern.test(String(value))) return 0n;
  const [whole, fraction = ""] = String(value).split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

function formatCents(value) {
  const amount = BigInt(value);
  const whole = (amount / 100n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `$ ${whole},${String(amount % 100n).padStart(2, "0")}`;
}

function newKey() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `sale-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function pendingStorageKey(id) {
  return `sigecom.sale-draft.pending.${id || "new"}`;
}

function readPendingWrite(id) {
  try {
    const value = sessionStorage.getItem(pendingStorageKey(id));
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function storePendingWrite(id, value) {
  try {
    if (value)
      sessionStorage.setItem(pendingStorageKey(id), JSON.stringify(value));
    else sessionStorage.removeItem(pendingStorageKey(id));
  } catch {
    // Keep the request in memory if browser storage is unavailable.
  }
}

export default function SaleFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const client = useQueryClient();
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerPage, setCustomerPage] = useState(1);
  const [productSearch, setProductSearch] = useState("");
  const [productPage, setProductPage] = useState(1);
  const pendingWrite = useRef(readPendingWrite(id));
  const saleQuery = useQuery({
    queryKey: ["sale", id],
    queryFn: () => salesApi.get(id),
    enabled: editing,
    retry: false,
  });
  const customers = useQuery({
    queryKey: ["sale-customers", customerSearch, customerPage],
    queryFn: () =>
      customersApi.list({
        page: customerPage,
        pageSize: 20,
        q: customerSearch,
        status: "active",
        sortBy: "name",
        sortOrder: "asc",
      }),
    retry: false,
  });
  const warehouses = useQuery({
    queryKey: ["sale-warehouses"],
    queryFn: () =>
      warehousesApi.list({
        page: 1,
        pageSize: 100,
        status: "active",
        sortBy: "name",
        sortOrder: "asc",
      }),
    retry: false,
  });
  const products = useQuery({
    queryKey: ["sale-products", productSearch, productPage],
    queryFn: () =>
      productsApi.list({
        page: productPage,
        pageSize: 10,
        q: productSearch,
        status: "active",
        sortBy: "name",
        sortOrder: "asc",
      }),
    retry: false,
  });
  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      customerId: "",
      warehouseId: "",
      saleDate: todayInBogota(),
      notes: "",
      lines: [],
    },
  });
  const lines = useWatch({ control, name: "lines" }) || emptyLines;
  const warehouseId = useWatch({ control, name: "warehouseId" });
  const total = useMemo(
    () =>
      lines.reduce(
        (sum, line) =>
          sum + asCents(line.unitPrice) * BigInt(line.quantity || 0),
        0n,
      ),
    [lines],
  );
  const lineProductIds = (saleQuery.data?.lines || [])
    .map((line) => line.productId)
    .join(",");
  const lineProducts = useQuery({
    queryKey: ["sale-edit-product-rules", lineProductIds],
    queryFn: () =>
      Promise.all(
        lineProductIds
          .split(",")
          .map((productId) => productsApi.get(productId)),
      ),
    enabled: editing && Boolean(lineProductIds),
    retry: false,
  });
  const balances = useQueries({
    queries: lines.map((line) => ({
      queryKey: ["sale-line-balance", warehouseId, line.productId],
      queryFn: () => productsApi.balances(line.productId, warehouseId),
      enabled: Boolean(warehouseId),
      retry: false,
    })),
  });

  useEffect(() => {
    if (!saleQuery.data) return;
    reset({
      customerId: saleQuery.data.customerId,
      warehouseId: saleQuery.data.warehouseId,
      saleDate: String(saleQuery.data.saleDate).slice(0, 10),
      notes: saleQuery.data.notes || "",
      lines: saleQuery.data.lines.map((line) => ({
        ...line,
        minimumSaleEnabled: false,
        minimumSaleQuantity: null,
      })),
    });
  }, [saleQuery.data, reset]);

  useEffect(() => {
    if (!editing || !saleQuery.data || !lineProducts.data) return;
    lineProducts.data.forEach((data, index) => {
      setValue(`lines.${index}.minimumSaleEnabled`, data.minimumSaleEnabled);
      setValue(`lines.${index}.minimumSaleQuantity`, data.minimumSaleQuantity);
    });
  }, [editing, lineProducts.data, saleQuery.data, setValue]);

  useEffect(() => {
    if (!isDirty) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const warnOnNavigation = (event) => {
      const link = event.target.closest("a[href]");
      if (!link || link.target === "_blank" || link.hasAttribute("download"))
        return;
      const destination = new URL(link.href, window.location.href);
      if (
        destination.origin !== window.location.origin ||
        destination.pathname === window.location.pathname
      )
        return;
      if (
        !window.confirm(
          "Tienes cambios sin guardar. ¿Quieres salir y descartarlos?",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", warnOnNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", warnOnNavigation, true);
    };
  }, [isDirty]);

  const save = useMutation({
    mutationFn: (values) => {
      const input = {
        customerId: values.customerId,
        warehouseId: values.warehouseId,
        saleDate: values.saleDate,
        notes: values.notes.trim() || null,
        lines: values.lines.map(({ productId, quantity, unitPrice }) => ({
          productId,
          quantity,
          unitPrice: unitPrice.includes(".") ? unitPrice : `${unitPrice}.00`,
        })),
      };
      const writeBody = {
        ...input,
        ...(editing ? { expectedVersion: saleQuery.data.version } : {}),
      };
      const fingerprint = JSON.stringify(writeBody);
      if (
        !pendingWrite.current ||
        pendingWrite.current.fingerprint !== fingerprint
      ) {
        pendingWrite.current = { key: newKey(), fingerprint };
        storePendingWrite(id, pendingWrite.current);
      }
      const { key } = pendingWrite.current;
      return editing
        ? salesApi.update(id, writeBody, key)
        : salesApi.create(input, key);
    },
    onSuccess: async (sale) => {
      pendingWrite.current = null;
      storePendingWrite(id, null);
      await client.invalidateQueries({ queryKey: ["sales"] });
      await client.setQueryData(["sale", sale.id], sale);
      toast.success(editing ? "Borrador actualizado." : "Borrador guardado.");
      navigate(`/ventas/${sale.id}`);
    },
    onError: (error) => {
      if (
        error.status &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 408
      ) {
        pendingWrite.current = null;
        storePendingWrite(id, null);
      }
      toast.error(
        error instanceof ApiError
          ? error.message
          : "No se pudo guardar el borrador. Si la respuesta fue incierta, reintenta sin cambiar los datos.",
      );
    },
  });

  function addProduct(product) {
    if (lines.some((line) => line.productId === product.id))
      return toast.info("Este producto ya está en la venta.");
    if (lines.length >= 50)
      return toast.error("Una venta admite hasta 50 productos distintos.");
    setValue(
      "lines",
      [
        ...lines,
        {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          unit: product.unit,
          quantity: product.minimumSaleEnabled
            ? Number(product.minimumSaleQuantity)
            : 1,
          unitPrice: product.salePrice,
          minimumSaleEnabled: product.minimumSaleEnabled,
          minimumSaleQuantity: product.minimumSaleQuantity,
        },
      ],
      { shouldDirty: true, shouldValidate: true },
    );
  }

  if (editing && saleQuery.isPending)
    return (
      <section className="page-section">
        <div className="purchase-state" role="status">
          Cargando borrador…
        </div>
      </section>
    );
  if (editing && (saleQuery.isError || saleQuery.data?.status !== "draft"))
    return (
      <section className="page-section">
        <div className="purchase-state purchase-state--error" role="alert">
          <h1>No se puede editar esta venta</h1>
          <p>
            {saleQuery.error?.message ||
              "Solo las ventas en borrador se pueden editar."}
          </p>
          <Button asChild variant="secondary">
            <Link to={`/ventas/${id}`}>Volver al detalle</Link>
          </Button>
        </div>
      </section>
    );

  return (
    <section className="page-section purchase-page">
      <Link
        className="purchase-back-link"
        to={editing ? `/ventas/${id}` : "/ventas"}
      >
        <ArrowLeft size={16} aria-hidden="true" /> Volver a ventas
      </Link>
      <header className="page-heading purchase-heading">
        <div>
          <p className="page-kicker">Ventas</p>
          <h1>{editing ? "Editar borrador" : "Nueva venta"}</h1>
          <p>
            El borrador conserva el precio comercial y no reserva ni descuenta
            existencias.
          </p>
        </div>
      </header>
      <form
        className="purchase-form"
        onSubmit={handleSubmit((values) => save.mutate(values))}
      >
        <section
          className="purchase-form-section"
          aria-labelledby="sale-data-heading"
        >
          <div className="purchase-section-heading">
            <div>
              <h2 id="sale-data-heading">Datos de la venta</h2>
              <p>Selecciona el cliente y la bodega autorizada.</p>
            </div>
            <span className="purchase-step">Documento</span>
          </div>
          <div className="purchase-fields-grid">
            <div className="purchase-field purchase-field--wide">
              <label htmlFor="sale-customer-search">Cliente activo</label>
              <div className="purchase-selector-search">
                <MagnifyingGlass size={16} aria-hidden="true" />
                <Input
                  id="sale-customer-search"
                  value={customerSearch}
                  onChange={(event) => {
                    setCustomerSearch(event.target.value);
                    setCustomerPage(1);
                  }}
                  placeholder="Buscar cliente"
                />
              </div>
              <select aria-label="Cliente" {...register("customerId")}>
                <option value="">Selecciona un cliente</option>
                {(customers.data?.items || []).map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name} · {customer.identificationNumber}
                  </option>
                ))}
              </select>
              {customers.isError ? (
                <small className="purchase-field-error">
                  No se pudieron cargar clientes.
                </small>
              ) : null}
              {customers.data?.pagination?.pageCount > 1 ? (
                <div className="purchase-selector-pages">
                  <button
                    type="button"
                    disabled={customerPage <= 1}
                    onClick={() => setCustomerPage((value) => value - 1)}
                  >
                    Anterior
                  </button>
                  <span>
                    Página {customerPage} de{" "}
                    {customers.data.pagination.pageCount}
                  </span>
                  <button
                    type="button"
                    disabled={
                      customerPage >= customers.data.pagination.pageCount
                    }
                    onClick={() => setCustomerPage((value) => value + 1)}
                  >
                    Siguiente
                  </button>
                </div>
              ) : null}
              {errors.customerId ? (
                <small className="purchase-field-error">
                  {errors.customerId.message}
                </small>
              ) : null}
            </div>
            <div className="purchase-field">
              <label htmlFor="sale-warehouse">Bodega</label>
              <select id="sale-warehouse" {...register("warehouseId")}>
                <option value="">Selecciona una bodega</option>
                {(warehouses.data?.items || []).map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
              {warehouses.isError ? (
                <small className="purchase-field-error">
                  No se pudieron cargar bodegas autorizadas.
                </small>
              ) : null}
              {errors.warehouseId ? (
                <small className="purchase-field-error">
                  {errors.warehouseId.message}
                </small>
              ) : null}
            </div>
            <div className="purchase-field">
              <label htmlFor="sale-date">Fecha</label>
              <Input id="sale-date" type="date" {...register("saleDate")} />
              {errors.saleDate ? (
                <small className="purchase-field-error">
                  {errors.saleDate.message}
                </small>
              ) : null}
            </div>
            <div className="purchase-field purchase-field--full">
              <label htmlFor="sale-notes">
                Notas <span>Opcional</span>
              </label>
              <textarea
                id="sale-notes"
                rows={3}
                maxLength={1000}
                {...register("notes")}
              />
            </div>
          </div>
        </section>

        <section
          className="purchase-form-section"
          aria-labelledby="sale-lines-heading"
        >
          <div className="purchase-section-heading">
            <div>
              <h2 id="sale-lines-heading">Productos</h2>
              <p>
                El precio se sugiere desde el catálogo y se guarda como
                instantánea del documento.
              </p>
            </div>
            <span className="purchase-step">{lines.length} / 50 productos</span>
          </div>
          <div className="purchase-product-picker">
            <label htmlFor="sale-product-search">Agregar producto activo</label>
            <div className="purchase-selector-search">
              <MagnifyingGlass size={16} aria-hidden="true" />
              <Input
                id="sale-product-search"
                type="search"
                value={productSearch}
                onChange={(event) => {
                  setProductSearch(event.target.value);
                  setProductPage(1);
                }}
                placeholder="Buscar por SKU o nombre"
              />
            </div>
            {products.isError ? (
              <p className="purchase-field-error" role="alert">
                No se pudieron cargar productos. Reintenta la consulta.
              </p>
            ) : null}
            <div
              className="purchase-product-results"
              aria-label="Resultados de productos"
            >
              {(products.data?.items || []).map((product) => (
                <button
                  type="button"
                  className="purchase-product-option"
                  key={product.id}
                  disabled={
                    lines.some((line) => line.productId === product.id) ||
                    lines.length >= 50
                  }
                  onClick={() => addProduct(product)}
                >
                  <span>
                    <strong>{product.name}</strong>
                    <small>
                      {product.sku} · {product.unit} · Mayorista{" "}
                      {formatCents(asCents(product.salePrice))}
                      {product.minimumSaleEnabled
                        ? ` · Mínimo ${product.minimumSaleQuantity}`
                        : ""}
                    </small>
                  </span>
                  <Plus size={18} aria-hidden="true" />
                </button>
              ))}
              {products.isPending ? (
                <p className="purchase-picker-state">Buscando productos…</p>
              ) : null}
              {!products.isPending &&
              !products.isError &&
              !products.data?.items?.length ? (
                <p className="purchase-picker-state">
                  No encontramos productos activos.
                </p>
              ) : null}
            </div>
            {products.data?.pagination?.pageCount > 1 ? (
              <div className="purchase-selector-pages">
                <button
                  type="button"
                  disabled={productPage <= 1}
                  onClick={() => setProductPage((value) => value - 1)}
                >
                  Anterior
                </button>
                <span>
                  Página {productPage} de {products.data.pagination.pageCount}
                </span>
                <button
                  type="button"
                  disabled={productPage >= products.data.pagination.pageCount}
                  onClick={() => setProductPage((value) => value + 1)}
                >
                  Siguiente
                </button>
              </div>
            ) : null}
          </div>
          {lines.length ? (
            <div className="purchase-lines-wrap">
              <table className="purchase-lines-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Cantidad</th>
                    <th>Precio unitario</th>
                    <th>Subtotal</th>
                    <th>
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => {
                    const balance = balances[index]?.data?.items?.find(
                      (item) => item.warehouseId === warehouseId,
                    );
                    return (
                      <tr key={line.productId}>
                        <td>
                          <strong>{line.name}</strong>
                          <small>
                            {line.sku} · {line.unit}
                            {line.minimumSaleEnabled
                              ? ` · mínimo ${line.minimumSaleQuantity}`
                              : ""}
                          </small>
                          <small className="sale-stock-note">
                            {warehouseId
                              ? balances[index]?.isPending
                                ? "Consultando existencias…"
                                : balances[index]?.isError
                                  ? "Existencias no disponibles para consulta"
                                  : `Existencia orientativa: ${balance?.quantity ?? 0} ${line.unit} · no reservada`
                              : "Selecciona una bodega para consultar existencia orientativa"}
                          </small>
                        </td>
                        <td>
                          <Input
                            aria-label={`Cantidad de ${line.name}`}
                            type="number"
                            min="1"
                            step="1"
                            {...register(`lines.${index}.quantity`, {
                              valueAsNumber: true,
                            })}
                          />
                          {errors.lines?.[index]?.quantity ? (
                            <small className="purchase-field-error">
                              {errors.lines[index].quantity.message}
                            </small>
                          ) : null}
                        </td>
                        <td>
                          <Input
                            aria-label={`Precio unitario de ${line.name}`}
                            inputMode="decimal"
                            {...register(`lines.${index}.unitPrice`)}
                          />
                          {errors.lines?.[index]?.unitPrice ? (
                            <small className="purchase-field-error">
                              {errors.lines[index].unitPrice.message}
                            </small>
                          ) : null}
                        </td>
                        <td>
                          {formatCents(
                            asCents(line.unitPrice) *
                              BigInt(line.quantity || 0),
                          )}
                        </td>
                        <td>
                          <button
                            className="purchase-remove-line"
                            type="button"
                            onClick={() =>
                              setValue(
                                "lines",
                                lines.filter(
                                  (_, lineIndex) => lineIndex !== index,
                                ),
                                { shouldDirty: true, shouldValidate: true },
                              )
                            }
                          >
                            Quitar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="purchase-lines-empty">
              Agrega al menos un producto para preparar la venta.
            </p>
          )}
          {errors.lines?.message ? (
            <p className="purchase-form-error" role="alert">
              {errors.lines.message}
            </p>
          ) : null}
          <div className="purchase-total-row">
            <span>Total estimado del borrador</span>
            <strong>{formatCents(total)}</strong>
            <small>
              El servidor recalcula y valida todos los importes al guardar.
            </small>
          </div>
        </section>
        {save.isError ? (
          <p className="purchase-form-error" role="alert">
            {save.error.message}
          </p>
        ) : null}
        <div className="purchase-form-actions">
          <Button asChild type="button" variant="secondary">
            <Link to={editing ? `/ventas/${id}` : "/ventas"}>Salir</Link>
          </Button>
          <Button
            type="submit"
            disabled={save.isPending || (editing && !saleQuery.data)}
          >
            {save.isPending ? "Guardando…" : "Guardar borrador"}
          </Button>
        </div>
      </form>
    </section>
  );
}
