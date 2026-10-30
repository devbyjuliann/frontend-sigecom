import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { Plus } from "@phosphor-icons/react/Plus";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "../components/ui/button.jsx";
import { Input } from "../components/ui/input.jsx";
import {
  ApiError,
  productsApi,
  purchasesApi,
  suppliersApi,
  warehousesApi,
} from "../lib/auth-api.js";

const moneyPattern = /^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/;
const emptyLines = [];
const schema = z.object({
  supplierId: z.string().min(1, "Selecciona un proveedor."),
  warehouseId: z.string().min(1, "Selecciona una bodega."),
  orderDate: z.string().min(1, "Indica la fecha de la orden."),
  reference: z.string().max(120, "Máximo 120 caracteres."),
  notes: z.string().max(1000, "Máximo 1000 caracteres."),
  lines: z
    .array(
      z.object({
        productId: z.string(),
        sku: z.string(),
        name: z.string(),
        unit: z.string(),
        quantity: z
          .number()
          .int()
          .min(1, "La cantidad debe ser al menos 1.")
          .max(4_294_967_295),
        unitCost: z
          .string()
          .regex(moneyPattern, "Usa un costo válido con máximo dos decimales."),
      }),
    )
    .min(1, "Agrega al menos un producto.")
    .max(50, "Una orden admite hasta 50 productos distintos."),
});
const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 2,
});

function addMoney(total, quantity, cost) {
  if (!moneyPattern.test(cost)) return total;
  const [whole, fractional = ""] = cost.split(".");
  return (
    total +
    (BigInt(whole) * 100n + BigInt(fractional.padEnd(2, "0"))) *
      BigInt(quantity || 0)
  );
}

function formatCents(cents) {
  const whole = (cents / 100n).toString();
  const fractional = (cents % 100n).toString().padStart(2, "0");
  return `$ ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${fractional}`;
}

function todayInBogota() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
  }).format(new Date());
}

export default function PurchaseFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [supplierQuery, setSupplierQuery] = useState("");
  const [supplierPage, setSupplierPage] = useState(1);
  const [productQuery, setProductQuery] = useState("");
  const [productPage, setProductPage] = useState(1);
  const orderQuery = useQuery({
    queryKey: ["purchase-order", id],
    queryFn: () => purchasesApi.get(id),
    enabled: editing,
    retry: false,
  });
  const suppliers = useQuery({
    queryKey: ["purchase-suppliers", supplierQuery, supplierPage],
    queryFn: () =>
      suppliersApi.list({
        page: supplierPage,
        pageSize: 20,
        q: supplierQuery,
        status: "active",
        sortBy: "name",
        sortOrder: "asc",
      }),
    retry: false,
  });
  const warehouses = useQuery({
    queryKey: ["purchase-warehouses"],
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
    queryKey: ["purchase-products", productQuery, productPage],
    queryFn: () =>
      productsApi.list({
        page: productPage,
        pageSize: 10,
        q: productQuery,
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
      supplierId: "",
      warehouseId: "",
      orderDate: todayInBogota(),
      reference: "",
      notes: "",
      lines: [],
    },
  });
  const lines = useWatch({ control, name: "lines" }) || emptyLines;

  useEffect(() => {
    if (!orderQuery.data) return;
    const order = orderQuery.data;
    reset({
      supplierId: order.supplierId,
      warehouseId: order.warehouseId,
      orderDate: String(order.orderDate).slice(0, 10),
      reference: order.reference || "",
      notes: order.notes || "",
      lines: order.lines.map((line) => ({
        productId: line.productId,
        sku: line.sku,
        name: line.name,
        unit: line.unit,
        quantity: line.quantity,
        unitCost: line.unitCost,
      })),
    });
  }, [orderQuery.data, reset]);

  const totalCents = useMemo(
    () =>
      lines.reduce(
        (total, line) => addMoney(total, line.quantity, line.unitCost),
        0n,
      ),
    [lines],
  );
  const save = useMutation({
    mutationFn: (values) => {
      const input = {
        ...values,
        reference: values.reference || null,
        notes: values.notes || null,
        lines: values.lines.map(({ productId, quantity, unitCost }) => ({
          productId,
          quantity,
          unitCost: unitCost.includes(".") ? unitCost : `${unitCost}.00`,
        })),
      };
      return editing
        ? purchasesApi.update(id, {
            ...input,
            expectedVersion: orderQuery.data.version,
          })
        : purchasesApi.create(input);
    },
    onSuccess: async (order) => {
      await queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      await queryClient.setQueryData(["purchase-order", order.id], order);
      toast.success(editing ? "Borrador actualizado." : "Borrador guardado.");
      navigate(`/compras/${order.id}`);
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError
          ? error.message
          : "No se pudo guardar la orden.",
      ),
  });

  function addProduct(product) {
    if (lines.some((line) => line.productId === product.id)) {
      toast.info("Este producto ya está en la orden.");
      return;
    }
    if (lines.length >= 50) {
      toast.error("Una orden admite hasta 50 productos distintos.");
      return;
    }
    setValue(
      "lines",
      [
        ...lines,
        {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          unit: product.unit,
          quantity: 1,
          unitCost: product.purchasePrice || "0.00",
        },
      ],
      { shouldDirty: true, shouldValidate: true },
    );
  }

  if (editing && orderQuery.isPending)
    return (
      <section className="page-section">
        <div className="purchase-state" role="status">
          Cargando borrador…
        </div>
      </section>
    );
  if (editing && (orderQuery.isError || orderQuery.data?.status !== "draft"))
    return (
      <section className="page-section">
        <div className="purchase-state purchase-state--error" role="alert">
          <h1>No se puede editar este borrador</h1>
          <p>
            {orderQuery.error?.message ||
              "Solo las órdenes en borrador se pueden editar."}
          </p>
          <Button asChild variant="secondary">
            <Link to={id ? `/compras/${id}` : "/compras"}>
              Volver a la orden
            </Link>
          </Button>
        </div>
      </section>
    );

  return (
    <section className="page-section purchase-page">
      <Link
        className="purchase-back-link"
        to={editing ? `/compras/${id}` : "/compras"}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Volver a órdenes
      </Link>
      <header className="page-heading purchase-heading">
        <div>
          <p className="page-kicker">Compras</p>
          <h1>{editing ? "Editar borrador" : "Nueva orden de compra"}</h1>
          <p>Organiza el pedido. Guardarlo no modifica las existencias.</p>
        </div>
      </header>

      <form
        className="purchase-form"
        onSubmit={handleSubmit((values) => save.mutate(values))}
      >
        <section
          className="purchase-form-section"
          aria-labelledby="purchase-data-heading"
        >
          <div className="purchase-section-heading">
            <div>
              <h2 id="purchase-data-heading">Datos del pedido</h2>
              <p>
                Define a quién compras y en qué bodega esperas la mercancía.
              </p>
            </div>
            <span className="purchase-step">Documento</span>
          </div>
          <div className="purchase-fields-grid">
            <div className="purchase-field purchase-field--wide">
              <label htmlFor="supplier-search">Proveedor</label>
              <div className="purchase-selector-search">
                <MagnifyingGlass size={16} aria-hidden="true" />
                <Input
                  id="supplier-search"
                  value={supplierQuery}
                  onChange={(event) => {
                    setSupplierQuery(event.target.value);
                    setSupplierPage(1);
                  }}
                  placeholder="Buscar proveedor activo"
                />
              </div>
              <select aria-label="Proveedor" {...register("supplierId")}>
                <option value="">Selecciona un proveedor</option>
                {(suppliers.data?.items || []).map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.businessName} · {supplier.identificationNumber}
                  </option>
                ))}
              </select>
              {suppliers.isError ? (
                <small className="purchase-field-error">
                  No se pudieron cargar proveedores.
                </small>
              ) : null}
              {suppliers.data?.pagination?.pageCount > 1 ? (
                <div className="purchase-selector-pages">
                  <button
                    type="button"
                    disabled={supplierPage <= 1}
                    onClick={() => setSupplierPage((page) => page - 1)}
                  >
                    Anterior
                  </button>
                  <span>
                    Página {supplierPage} de{" "}
                    {suppliers.data.pagination.pageCount}
                  </span>
                  <button
                    type="button"
                    disabled={
                      supplierPage >= suppliers.data.pagination.pageCount
                    }
                    onClick={() => setSupplierPage((page) => page + 1)}
                  >
                    Siguiente
                  </button>
                </div>
              ) : null}
              {errors.supplierId ? (
                <small className="purchase-field-error">
                  {errors.supplierId.message}
                </small>
              ) : null}
            </div>
            <div className="purchase-field">
              <label htmlFor="purchase-warehouse">Bodega destino</label>
              <select id="purchase-warehouse" {...register("warehouseId")}>
                <option value="">Selecciona una bodega</option>
                {(warehouses.data?.items || []).map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
              {errors.warehouseId ? (
                <small className="purchase-field-error">
                  {errors.warehouseId.message}
                </small>
              ) : null}
              {warehouses.isError ? (
                <small className="purchase-field-error">
                  No se pudieron cargar bodegas autorizadas.
                </small>
              ) : null}
            </div>
            <div className="purchase-field">
              <label htmlFor="purchase-date">Fecha de la orden</label>
              <Input
                id="purchase-date"
                type="date"
                {...register("orderDate")}
              />
              {errors.orderDate ? (
                <small className="purchase-field-error">
                  {errors.orderDate.message}
                </small>
              ) : null}
            </div>
            <div className="purchase-field purchase-field--wide">
              <label htmlFor="purchase-reference">
                Referencia del proveedor <span>Opcional</span>
              </label>
              <Input
                id="purchase-reference"
                maxLength={120}
                placeholder="Cotización o pedido"
                {...register("reference")}
              />
            </div>
            <div className="purchase-field purchase-field--full">
              <label htmlFor="purchase-notes">
                Notas <span>Opcional</span>
              </label>
              <textarea
                id="purchase-notes"
                rows={3}
                maxLength={1000}
                placeholder="Condiciones o indicaciones del pedido"
                {...register("notes")}
              />
            </div>
          </div>
        </section>

        <section
          className="purchase-form-section"
          aria-labelledby="purchase-lines-heading"
        >
          <div className="purchase-section-heading">
            <div>
              <h2 id="purchase-lines-heading">Productos del pedido</h2>
              <p>El costo ingresado pertenece a esta orden, no al catálogo.</p>
            </div>
            <span className="purchase-step">{lines.length} / 50 productos</span>
          </div>
          <div className="purchase-product-picker">
            <label htmlFor="purchase-product-search">
              Agregar producto activo
            </label>
            <div className="purchase-selector-search">
              <MagnifyingGlass size={16} aria-hidden="true" />
              <Input
                id="purchase-product-search"
                type="search"
                value={productQuery}
                onChange={(event) => {
                  setProductQuery(event.target.value);
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
                      {product.sku} · {product.unit} · Costo catálogo{" "}
                      {currency.format(Number(product.purchasePrice))}
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
                  onClick={() => setProductPage((page) => page - 1)}
                >
                  Anterior
                </button>
                <span>
                  Página {productPage} de {products.data.pagination.pageCount}
                </span>
                <button
                  type="button"
                  disabled={productPage >= products.data.pagination.pageCount}
                  onClick={() => setProductPage((page) => page + 1)}
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
                    <th>Costo unitario</th>
                    <th>Subtotal</th>
                    <th>
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => (
                    <tr key={line.productId}>
                      <td>
                        <strong>{line.name}</strong>
                        <small>
                          {line.sku} · {line.unit}
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
                      </td>
                      <td>
                        <Input
                          aria-label={`Costo unitario de ${line.name}`}
                          inputMode="decimal"
                          {...register(`lines.${index}.unitCost`)}
                        />
                      </td>
                      <td>
                        {formatCents(
                          addMoney(
                            0n,
                            Number(line.quantity) || 0,
                            line.unitCost,
                          ),
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
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="purchase-lines-empty">
              Busca y agrega los productos que incluirás en esta orden.
            </div>
          )}
          {errors.lines ? (
            <p className="purchase-field-error" role="alert">
              {errors.lines.message ||
                "Revisa las cantidades y costos indicados."}
            </p>
          ) : null}
          {lines.some(
            (line) =>
              line.unitCost === "0" ||
              line.unitCost === "0.00" ||
              line.unitCost === "0.0",
          ) ? (
            <p className="purchase-zero-cost-note">
              Los costos en cero se señalarán nuevamente antes de confirmar la
              orden.
            </p>
          ) : null}
          <div className="purchase-total-row">
            <span>
              Total estimado <small>Calculado en el servidor al guardar</small>
            </span>
            <strong>{formatCents(totalCents)}</strong>
          </div>
        </section>

        {save.error ? (
          <p className="purchase-form-error" role="alert">
            {save.error instanceof ApiError &&
            save.error.code.includes("VERSION")
              ? "El borrador se modificó en otra sesión. Vuelve a cargarlo antes de guardar."
              : save.error.message || "No se pudo guardar el borrador."}
          </p>
        ) : null}
        <footer className="purchase-form-actions">
          <Button asChild variant="secondary">
            <Link to={editing ? `/compras/${id}` : "/compras"}>Cancelar</Link>
          </Button>
          <Button
            type="submit"
            disabled={save.isPending || (editing && !isDirty)}
          >
            {save.isPending ? "Guardando…" : "Guardar borrador"}
          </Button>
        </footer>
      </form>
    </section>
  );
}
