import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { Warning } from "@phosphor-icons/react/Warning";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../auth/auth-context.jsx";
import { Button } from "../components/ui/button.jsx";
import { salesApi } from "../lib/auth-api.js";

function formatMoney(value) {
  const [whole, fractional = "00"] = String(value).split(".");
  return `$ ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${fractional.padEnd(2, "0").slice(0, 2)}`;
}
const dateFormat = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeZone: "America/Bogota",
});
const dateTimeFormat = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Bogota",
});
const stateLabels = {
  draft: "Borrador",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
};
function makeKey() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `sale-request-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function confirmationStorageKey(id) {
  return `sigecom.sale-confirmation.pending.${id}`;
}

function readPendingConfirmation(id) {
  try {
    const value = sessionStorage.getItem(confirmationStorageKey(id));
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function storePendingConfirmation(id, value) {
  try {
    if (value)
      sessionStorage.setItem(confirmationStorageKey(id), JSON.stringify(value));
    else sessionStorage.removeItem(confirmationStorageKey(id));
  } catch {
    // Keep the request in memory if browser storage is unavailable.
  }
}

function cancellationStorageKey(id) {
  return `sigecom.sale-cancellation.pending.${id}`;
}

function readPendingCancellation(id) {
  try {
    const value = sessionStorage.getItem(cancellationStorageKey(id));
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function storePendingCancellation(id, value) {
  try {
    if (value)
      sessionStorage.setItem(cancellationStorageKey(id), JSON.stringify(value));
    else sessionStorage.removeItem(cancellationStorageKey(id));
  } catch {
    // Keep the request in memory if browser storage is unavailable.
  }
}

export default function SaleDetailPage() {
  const { id } = useParams();
  const { session } = useAuth();
  const client = useQueryClient();
  const [savedCancellation] = useState(() => readPendingCancellation(id));
  const pendingCancellation = useRef(savedCancellation);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState(() => savedCancellation?.reason || "");
  const [savedConfirmation] = useState(() => readPendingConfirmation(id));
  const pendingConfirmation = useRef(savedConfirmation);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmationError, setConfirmationError] = useState("");
  const sale = useQuery({
    queryKey: ["sale", id],
    queryFn: () => salesApi.get(id),
    retry: false,
  });
  const canEdit =
    sale.data?.status === "draft" &&
    session.permissions.includes("sales.create") &&
    (session.user.role !== "seller" || sale.data.createdBy === session.user.id);
  const canCancel =
    sale.data?.status === "draft" &&
    session.permissions.includes("sales.cancel");
  const canConfirm =
    sale.data?.status === "draft" &&
    session.permissions.includes("sales.confirm") &&
    (session.user.role !== "seller" || sale.data.createdBy === session.user.id);
  const cancel = useMutation({
    mutationFn: () => {
      const body = {
        expectedVersion: sale.data.version,
        reason: reason.trim(),
      };
      const fingerprint = JSON.stringify(body);
      if (
        !pendingCancellation.current ||
        pendingCancellation.current.fingerprint !== fingerprint
      ) {
        pendingCancellation.current = {
          key: makeKey(),
          fingerprint,
          reason: body.reason,
        };
        storePendingCancellation(id, pendingCancellation.current);
      }
      return salesApi.cancel(id, body, pendingCancellation.current.key);
    },
    onSuccess: async (updated) => {
      pendingCancellation.current = null;
      storePendingCancellation(id, null);
      await client.setQueryData(["sale", id], updated);
      await client.invalidateQueries({ queryKey: ["sales"] });
      setCancelOpen(false);
      setReason("");
      toast.success("Borrador cancelado. No se modificaron existencias.");
    },
    onError: (error) => {
      if (
        error.status &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 408
      ) {
        pendingCancellation.current = null;
        storePendingCancellation(id, null);
      }
      toast.error(error.message || "No se pudo cancelar el borrador.");
    },
  });
  const confirm = useMutation({
    mutationFn: () => {
      const body = { expectedVersion: sale.data.version };
      const fingerprint = JSON.stringify(body);
      if (
        !pendingConfirmation.current ||
        pendingConfirmation.current.fingerprint !== fingerprint
      ) {
        pendingConfirmation.current = { key: makeKey(), fingerprint };
        storePendingConfirmation(id, pendingConfirmation.current);
      }
      setConfirmationError("");
      return salesApi.confirm(id, body, pendingConfirmation.current.key);
    },
    onSuccess: async (updated) => {
      pendingConfirmation.current = null;
      storePendingConfirmation(id, null);
      await client.setQueryData(["sale", id], updated);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["sales"] }),
        client.invalidateQueries({ queryKey: ["sale-line-balance"] }),
        client.invalidateQueries({ queryKey: ["inventory"] }),
        client.invalidateQueries({ queryKey: ["dashboard"] }),
        client.invalidateQueries({ queryKey: ["products", "balances"] }),
      ]);
      setConfirmOpen(false);
      toast.success("Venta confirmada y existencias actualizadas.");
    },
    onError: (error) => {
      setConfirmationError(error.message || "No se pudo confirmar la venta.");
      if (
        error.status &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 408
      ) {
        pendingConfirmation.current = null;
        storePendingConfirmation(id, null);
      }
    },
  });

  if (sale.isPending)
    return (
      <section className="page-section">
        <div className="purchase-state" role="status">
          Cargando venta…
        </div>
      </section>
    );
  if (sale.isError)
    return (
      <section className="page-section">
        <div className="purchase-state purchase-state--error" role="alert">
          <h1>No se pudo cargar la venta</h1>
          <p>{sale.error.message}</p>
          <Button asChild variant="secondary">
            <Link to="/ventas">Volver a ventas</Link>
          </Button>
        </div>
      </section>
    );
  const document = sale.data;

  return (
    <section className="page-section purchase-page">
      <Link className="purchase-back-link" to="/ventas">
        <ArrowLeft size={16} aria-hidden="true" /> Volver a ventas
      </Link>
      <header className="page-heading purchase-heading sale-detail-heading">
        <div>
          <p className="page-kicker">Ventas / {document.number}</p>
          <div className="purchase-code-line">
            <h1>{document.number}</h1>
            <span
              className={`purchase-status purchase-status--${document.status}`}
            >
              {stateLabels[document.status]}
            </span>
          </div>
          <p>Documento comercial · versión {document.version}</p>
        </div>
        <div className="sale-detail-actions">
          {canConfirm ? (
            <Dialog.Root
              open={confirmOpen}
              onOpenChange={(open) => {
                if (!confirm.isPending) setConfirmOpen(open);
                if (open) setConfirmationError("");
              }}
            >
              <Dialog.Trigger asChild>
                <Button>Confirmar venta</Button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="dialog-overlay" />
                <Dialog.Content className="purchase-dialog">
                  <Dialog.Title>Revisar venta {document.number}</Dialog.Title>
                  <Dialog.Description>
                    Confirma los datos guardados. La operación descontará las
                    existencias de forma transaccional.
                  </Dialog.Description>
                  <div className="sale-confirm-review">
                    <p>
                      <strong>Cliente:</strong> {document.customerName}
                    </p>
                    <p>
                      <strong>Bodega:</strong> {document.warehouseName}
                    </p>
                    <div>
                      <strong>Productos:</strong>
                      <ul>
                        {document.lines.map((line) => (
                          <li key={line.id}>
                            {line.name} —{" "}
                            {line.quantity.toLocaleString("es-CO")} {line.unit}{" "}
                            × {formatMoney(line.unitPrice)} ={" "}
                            {formatMoney(line.lineTotal)}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <p>
                      <strong>Total:</strong> {formatMoney(document.total)}
                    </p>
                  </div>
                  <p className="sale-neutral-banner">
                    <Warning size={18} aria-hidden="true" />
                    <span>
                      Al confirmar se descontarán estas cantidades del
                      inventario de {document.warehouseName}.
                    </span>
                  </p>
                  {confirmationError ? (
                    <div className="purchase-state--error" role="alert">
                      {confirmationError}
                      {!confirm.isPending &&
                      (!confirm.error?.status ||
                        confirm.error.status === 408 ||
                        confirm.error.status >= 500) ? (
                        <p>
                          El resultado puede ser incierto. Reintenta para
                          consultar la misma solicitud sin duplicar el
                          descuento.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="purchase-dialog-actions">
                    <Button
                      variant="secondary"
                      disabled={confirm.isPending}
                      onClick={() => setConfirmOpen(false)}
                    >
                      Volver
                    </Button>
                    <Button
                      disabled={confirm.isPending}
                      onClick={() => confirm.mutate()}
                    >
                      {confirm.isPending
                        ? "Confirmando…"
                        : confirmationError
                          ? "Reintentar confirmación"
                          : "Confirmar y descontar existencias"}
                    </Button>
                  </div>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          ) : null}
          {canEdit ? (
            <Button asChild variant="secondary">
              <Link to={`/ventas/${id}/editar`}>
                <PencilSimple size={17} aria-hidden="true" /> Editar borrador
              </Link>
            </Button>
          ) : null}
          {canCancel ? (
            <Dialog.Root open={cancelOpen} onOpenChange={setCancelOpen}>
              <Dialog.Trigger asChild>
                <Button
                  variant="secondary"
                  className="border-red-200 text-red-700 hover:bg-red-50"
                >
                  Cancelar borrador
                </Button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="dialog-overlay" />
                <Dialog.Content className="purchase-dialog">
                  <Dialog.Title>
                    Cancelar borrador {document.number}
                  </Dialog.Title>
                  <Dialog.Description>
                    Indica el motivo. La venta quedará en el historial y no
                    afectará las existencias.
                  </Dialog.Description>
                  <label htmlFor="sale-cancel-reason">
                    Motivo de cancelación
                  </label>
                  <textarea
                    id="sale-cancel-reason"
                    rows={4}
                    maxLength={500}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Describe por qué se cancela este borrador"
                  />
                  <div className="purchase-dialog-actions">
                    <Button
                      variant="secondary"
                      onClick={() => setCancelOpen(false)}
                    >
                      Volver
                    </Button>
                    <Button
                      variant="secondary"
                      className="border-red-200 text-red-700 hover:bg-red-50"
                      disabled={reason.trim().length < 3 || cancel.isPending}
                      onClick={() => cancel.mutate()}
                    >
                      {cancel.isPending
                        ? "Cancelando…"
                        : "Confirmar cancelación"}
                    </Button>
                  </div>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          ) : null}
        </div>
      </header>

      {document.status === "draft" ? (
        <div className="sale-neutral-banner">
          <Warning size={18} aria-hidden="true" />
          <p>
            Este documento está en borrador. Guardarlo no reserva ni descuenta
            existencias.
          </p>
        </div>
      ) : null}
      <section
        className="purchase-detail-layout"
        aria-label="Información de la venta"
      >
        <article className="purchase-summary">
          <h2>Datos comerciales</h2>
          <dl>
            <div>
              <dt>Cliente</dt>
              <dd>
                {document.customerName}
                <small>{document.customerIdentification}</small>
              </dd>
            </div>
            <div>
              <dt>Bodega</dt>
              <dd>
                {document.warehouseName}
                <small>
                  {document.warehouseCode}
                  {document.warehouseLocation
                    ? ` · ${document.warehouseLocation}`
                    : ""}
                </small>
              </dd>
            </div>
            <div>
              <dt>Fecha</dt>
              <dd>
                {dateFormat.format(
                  new Date(`${document.saleDate}T12:00:00-05:00`),
                )}
              </dd>
            </div>
            <div>
              <dt>Responsable</dt>
              <dd>
                {document.createdByName}
                <small>
                  Creada {dateFormat.format(new Date(document.createdAt))}
                </small>
              </dd>
            </div>
            <div>
              <dt>Última actualización</dt>
              <dd>
                {document.updatedByName}
                <small>{dateFormat.format(new Date(document.updatedAt))}</small>
              </dd>
            </div>
            {document.cancellationReason ? (
              <div>
                <dt>Motivo de cancelación</dt>
                <dd>
                  {document.cancellationReason}
                  <small>
                    {document.cancelledByName} ·{" "}
                    {dateFormat.format(new Date(document.cancelledAt))}
                  </small>
                </dd>
              </div>
            ) : null}
            {document.status === "confirmed" ? (
              <div>
                <dt>Confirmación</dt>
                <dd>
                  {document.confirmedByName || "Usuario"}
                  {document.confirmedAt ? (
                    <small>
                      Confirmada por {document.confirmedByName || "usuario"} ·{" "}
                      {dateTimeFormat.format(new Date(document.confirmedAt))}
                    </small>
                  ) : null}
                </dd>
              </div>
            ) : null}
          </dl>
        </article>
        <article className="purchase-summary">
          <h2>Resumen</h2>
          <dl>
            <div>
              <dt>Productos</dt>
              <dd>{document.lines.length}</dd>
            </div>
            <div className="purchase-total-row">
              <span>Total del documento</span>
              <strong>{formatMoney(document.total)}</strong>
            </div>
          </dl>
          {document.notes ? (
            <div className="purchase-notes">
              <h2>Notas</h2>
              <p>{document.notes}</p>
            </div>
          ) : null}
        </article>
      </section>
      <section
        className="purchase-form-section sale-detail-lines"
        aria-labelledby="sale-detail-lines-heading"
      >
        <div className="purchase-section-heading">
          <div>
            <h2 id="sale-detail-lines-heading">Productos de la venta</h2>
            <p>Precios y cantidades conservados en este documento.</p>
          </div>
          <span className="purchase-step">
            {document.lines.length} productos
          </span>
        </div>
        <div className="purchase-table-wrap">
          <table className="purchase-products-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Producto</th>
                <th>Unidad</th>
                <th className="purchase-quantity-cell">Cantidad</th>
                <th className="purchase-quantity-cell">Precio unitario</th>
                <th className="purchase-quantity-cell">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {document.lines.map((line) => (
                <tr key={line.id}>
                  <td data-label="SKU">{line.sku}</td>
                  <td data-label="Producto" className="purchase-product-name">
                    {line.name}
                  </td>
                  <td data-label="Unidad">{line.unit}</td>
                  <td data-label="Cantidad" className="purchase-quantity-cell">
                    {line.quantity.toLocaleString("es-CO")}
                  </td>
                  <td
                    data-label="Precio unitario"
                    className="purchase-quantity-cell"
                  >
                    {formatMoney(line.unitPrice)}
                  </td>
                  <td data-label="Subtotal" className="purchase-quantity-cell">
                    {formatMoney(line.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan="5" scope="row">
                  Total
                </th>
                <td className="purchase-quantity-cell">
                  <strong>{formatMoney(document.total)}</strong>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </section>
  );
}
