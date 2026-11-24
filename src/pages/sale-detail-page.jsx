import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { Warning } from "@phosphor-icons/react/Warning";
import { DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../auth/auth-context.jsx";
import {
  readPendingOperation,
  writePendingOperation,
} from "../auth/pending-operation-storage.js";
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

export default function SaleDetailPage() {
  const { id } = useParams();
  const { session, pendingStorageLease } = useAuth();
  const client = useQueryClient();
  const [savedCancellation] = useState(() =>
    readPendingOperation(pendingStorageLease, "saleCancellation", id),
  );
  const pendingCancellation = useRef(savedCancellation);
  const [savedReversal] = useState(() =>
    readPendingOperation(pendingStorageLease, "saleReversal", id),
  );
  const pendingReversal = useRef(savedReversal);
  const [savedCustomerReturn] = useState(() =>
    readPendingOperation(pendingStorageLease, "customerReturn", id),
  );
  const pendingCustomerReturn = useRef(savedCustomerReturn);
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnReview, setReturnReview] = useState(false);
  const [returnReference, setReturnReference] = useState(
    () => savedCustomerReturn?.input?.reference || "",
  );
  const [returnReason, setReturnReason] = useState(
    () => savedCustomerReturn?.input?.reason || "",
  );
  const [returnObservation, setReturnObservation] = useState(
    () => savedCustomerReturn?.input?.physicalObservation || "",
  );
  const [returnDeclarations, setReturnDeclarations] = useState({
    receivedPhysical: savedCustomerReturn?.input?.receivedPhysical || false,
    inspected: savedCustomerReturn?.input?.inspected || false,
  });
  const [returnLines, setReturnLines] = useState(
    () => savedCustomerReturn?.lines || {},
  );
  const [returnError, setReturnError] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState(() => savedCancellation?.reason || "");
  const [reversalReason, setReversalReason] = useState(
    () => savedReversal?.input?.reason || "",
  );
  const [reversalReference, setReversalReference] = useState(
    () => savedReversal?.input?.reference || "",
  );
  const [reversalObservation, setReversalObservation] = useState(
    () => savedReversal?.input?.physicalObservation || "",
  );
  const [declarations, setDeclarations] = useState({
    neverDispatched: savedReversal?.input?.neverDispatched || false,
    allQuantitiesPresent: savedReversal?.input?.allQuantitiesPresent || false,
    allProductsSaleable: savedReversal?.input?.allProductsSaleable || false,
  });
  const [reversalOpen, setReversalOpen] = useState(false);
  const [reversalReview, setReversalReview] = useState(false);
  const [reversalError, setReversalError] = useState("");
  const [savedConfirmation] = useState(() =>
    readPendingOperation(pendingStorageLease, "saleConfirmation", id),
  );
  const pendingConfirmation = useRef(savedConfirmation);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmationError, setConfirmationError] = useState("");
  const sale = useQuery({
    queryKey: ["sale", id],
    queryFn: () => salesApi.get(id),
    retry: false,
  });
  const reversalDocument = useQuery({
    queryKey: ["sale-reversal", id],
    queryFn: () => salesApi.getReversal(id),
    enabled:
      sale.data?.status === "cancelled" && Boolean(sale.data.confirmedAt),
    retry: false,
  });
  const customerReturns = useQuery({
    queryKey: ["sale-returns", id],
    queryFn: () => salesApi.returns(id),
    enabled: sale.data?.status === "confirmed",
    retry: false,
  });
  const canEdit =
    sale.data?.status === "draft" &&
    sale.data.warehouseIsActive === true &&
    session.warehouseIds?.includes(String(sale.data.warehouseId)) &&
    session.permissions.includes("sales.create") &&
    (session.user.role !== "seller" || sale.data.createdBy === session.user.id);
  const canCancel =
    sale.data?.status === "draft" &&
    sale.data.warehouseIsActive === true &&
    session.warehouseIds?.includes(String(sale.data.warehouseId)) &&
    session.permissions.includes("sales.cancel");
  const canReverse =
    sale.data?.status === "confirmed" &&
    sale.data.warehouseIsActive === true &&
    session.warehouseIds?.includes(String(sale.data.warehouseId)) &&
    session.user.role === "administrator" &&
    session.permissions.includes("sales.cancel");
  const canReturn =
    sale.data?.status === "confirmed" &&
    sale.data.warehouseIsActive === true &&
    session.warehouseIds?.includes(String(sale.data.warehouseId)) &&
    session.user.role === "administrator" &&
    session.permissions.includes("sales.return");
  const canConfirm =
    sale.data?.status === "draft" &&
    sale.data.warehouseIsActive === true &&
    session.warehouseIds?.includes(String(sale.data.warehouseId)) &&
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
        writePendingOperation(
          pendingStorageLease,
          "saleCancellation",
          id,
          pendingCancellation.current,
        );
      }
      return salesApi.cancel(id, body, pendingCancellation.current.key);
    },
    onSuccess: async (updated) => {
      pendingCancellation.current = null;
      writePendingOperation(pendingStorageLease, "saleCancellation", id, null);
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
        writePendingOperation(
          pendingStorageLease,
          "saleCancellation",
          id,
          null,
        );
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
        writePendingOperation(
          pendingStorageLease,
          "saleConfirmation",
          id,
          pendingConfirmation.current,
        );
      }
      setConfirmationError("");
      return salesApi.confirm(id, body, pendingConfirmation.current.key);
    },
    onSuccess: async (updated) => {
      pendingConfirmation.current = null;
      writePendingOperation(pendingStorageLease, "saleConfirmation", id, null);
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
        writePendingOperation(
          pendingStorageLease,
          "saleConfirmation",
          id,
          null,
        );
      }
    },
  });
  const reverse = useMutation({
    mutationFn: () => {
      const body = {
        expectedVersion: sale.data.version,
        reason: reversalReason.trim(),
        reference: reversalReference.trim(),
        physicalObservation: reversalObservation.trim(),
        ...declarations,
      };
      const fingerprint = JSON.stringify(body);
      if (
        !pendingReversal.current ||
        pendingReversal.current.fingerprint !== fingerprint
      ) {
        pendingReversal.current = { key: makeKey(), fingerprint, input: body };
        writePendingOperation(
          pendingStorageLease,
          "saleReversal",
          id,
          pendingReversal.current,
        );
      }
      setReversalError("");
      return salesApi.reverse(id, body, pendingReversal.current.key);
    },
    onSuccess: async ({ sale: updatedSale, reversal: document }) => {
      pendingReversal.current = null;
      writePendingOperation(pendingStorageLease, "saleReversal", id, null);
      client.setQueryData(["sale", id], updatedSale);
      client.setQueryData(["sale-reversal", id], document);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["sales"] }),
        client.invalidateQueries({ queryKey: ["inventory"] }),
        client.invalidateQueries({ queryKey: ["products", "balances"] }),
        client.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
      setReversalOpen(false);
      setReversalReview(false);
      toast.success("Venta anulada y existencias reintegradas.");
    },
    onError: (error) => {
      setReversalError(error.message || "No se pudo anular la venta.");
      if (
        error.status &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 408
      ) {
        pendingReversal.current = null;
        writePendingOperation(pendingStorageLease, "saleReversal", id, null);
      }
    },
  });
  const returnCustomerGoods = useMutation({
    mutationFn: () => {
      const lines = document.lines
        .filter((line) => Number(returnLines[line.id]?.quantityReceived) > 0)
        .map((line) => ({
          saleLineId: line.id,
          quantityReceived: Number(returnLines[line.id].quantityReceived),
          quantityRestocked: Number(
            returnLines[line.id].quantityRestocked || 0,
          ),
          nonRestockReason: String(
            returnLines[line.id].nonRestockReason || "",
          ).trim(),
        }));
      let body = {
        expectedVersion: document.version,
        reference: returnReference.trim(),
        reason: returnReason.trim(),
        physicalObservation: returnObservation.trim(),
        ...returnDeclarations,
        lines,
      };
      const pending = pendingCustomerReturn.current;
      const replayBody = pending?.input
        ? { ...body, expectedVersion: pending.input.expectedVersion }
        : null;
      if (
        pending &&
        JSON.stringify(replayBody) === JSON.stringify(pending.input)
      ) {
        body = pending.input;
      } else {
        const fingerprint = JSON.stringify(body);
        pendingCustomerReturn.current = {
          key: makeKey(),
          fingerprint,
          input: body,
          lines: returnLines,
        };
        writePendingOperation(
          pendingStorageLease,
          "customerReturn",
          id,
          pendingCustomerReturn.current,
        );
      }
      setReturnError("");
      return salesApi.createReturn(id, body, pendingCustomerReturn.current.key);
    },
    onSuccess: async ({
      sale: updated,
      customerReturn: customerReturnDocument,
    }) => {
      pendingCustomerReturn.current = null;
      writePendingOperation(pendingStorageLease, "customerReturn", id, null);
      client.setQueryData(["sale", id], updated);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["sale-returns", id] }),
        client.invalidateQueries({ queryKey: ["sales"] }),
        client.invalidateQueries({ queryKey: ["inventory"] }),
        client.invalidateQueries({ queryKey: ["products", "balances"] }),
        client.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
      setReturnOpen(false);
      setReturnReview(false);
      toast.success(
        customerReturnDocument.sourceOperationId
          ? "Devolución confirmada y existencias aptas reintegradas."
          : "Devolución confirmada sin cambios en Inventario.",
      );
    },
    onError: (error) => {
      setReturnError(error.message || "No se pudo registrar la devolución.");
      if (error.status >= 400 && error.status < 500 && error.status !== 408) {
        pendingCustomerReturn.current = null;
        writePendingOperation(pendingStorageLease, "customerReturn", id, null);
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
  const hasEligibleReturnLine = document.lines.some(
    (line) => (line.returnableQuantity ?? line.quantity) > 0,
  );

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
              {document.status === "cancelled" && document.confirmedAt
                ? "Anulada"
                : stateLabels[document.status]}
            </span>
          </div>
          <p>Documento comercial · versión {document.version}</p>
        </div>
        <div className="sale-detail-actions">
          {document.confirmedAt ? (
            <Button asChild variant="secondary">
              <a href={salesApi.confirmationPdfUrl(id)} download>
                <DownloadSimple size={17} aria-hidden="true" />
                Descargar venta PDF
              </a>
            </Button>
          ) : null}
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
          {canReverse ? (
            <Dialog.Root
              open={reversalOpen}
              onOpenChange={(open) => {
                if (!reverse.isPending) setReversalOpen(open);
                if (open) {
                  setReversalReview(false);
                  setReversalError("");
                }
              }}
            >
              <Dialog.Trigger asChild>
                <Button
                  variant="secondary"
                  className="border-red-200 text-red-700 hover:bg-red-50"
                >
                  Anular venta
                </Button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="dialog-overlay" />
                <Dialog.Content className="purchase-dialog sale-reversal-dialog">
                  <Dialog.Title>Anular venta {document.number}</Dialog.Title>
                  <Dialog.Description>
                    Esta anulación es completa e irreversible. Solo procede si
                    la mercancía nunca salió físicamente y sigue completa y apta
                    en {document.warehouseName}.
                  </Dialog.Description>
                  {!reversalReview ? (
                    <div className="sale-reversal-form">
                      <label htmlFor="sale-reversal-reason">
                        Motivo de anulación
                      </label>
                      <textarea
                        id="sale-reversal-reason"
                        rows={2}
                        maxLength={500}
                        value={reversalReason}
                        onChange={(event) =>
                          setReversalReason(event.target.value)
                        }
                      />
                      <label htmlFor="sale-reversal-reference">
                        Referencia de verificación física
                      </label>
                      <input
                        id="sale-reversal-reference"
                        maxLength={120}
                        value={reversalReference}
                        onChange={(event) =>
                          setReversalReference(event.target.value)
                        }
                      />
                      <label htmlFor="sale-reversal-observation">
                        Observaciones de la comprobación
                      </label>
                      <textarea
                        id="sale-reversal-observation"
                        rows={3}
                        maxLength={1000}
                        value={reversalObservation}
                        onChange={(event) =>
                          setReversalObservation(event.target.value)
                        }
                      />
                      <fieldset className="sale-reversal-declarations">
                        <legend>Declaraciones del responsable</legend>
                        {[
                          [
                            "neverDispatched",
                            "Declaro que la mercancía nunca salió físicamente de la bodega",
                          ],
                          [
                            "allQuantitiesPresent",
                            "Declaro que todas las cantidades originales están completas",
                          ],
                          [
                            "allProductsSaleable",
                            "Declaro que todos los productos permanecen aptos para vender",
                          ],
                        ].map(([name, label]) => (
                          <label key={name}>
                            <input
                              type="checkbox"
                              checked={declarations[name]}
                              onChange={(event) =>
                                setDeclarations((current) => ({
                                  ...current,
                                  [name]: event.target.checked,
                                }))
                              }
                            />
                            <span>{label}</span>
                          </label>
                        ))}
                      </fieldset>
                      <p className="sale-neutral-banner" role="note">
                        Estas declaraciones quedan registradas a tu nombre.
                        SIGECOM no comprueba automáticamente el estado físico ni
                        el despacho de la mercancía.
                      </p>
                    </div>
                  ) : (
                    <div className="sale-reversal-review">
                      <p className="sale-reversal-warning" role="alert">
                        Al confirmar se reintegrarán todas las cantidades de
                        esta venta en {document.warehouseName}. No continúes si
                        la mercancía salió o no está físicamente completa y
                        apta.
                      </p>
                      <div className="purchase-table-wrap">
                        <table className="purchase-products-table">
                          <caption className="sr-only">
                            Cantidades que se reintegrarán al inventario
                          </caption>
                          <thead>
                            <tr>
                              <th scope="col">Producto</th>
                              <th scope="col">Cantidad a reintegrar</th>
                            </tr>
                          </thead>
                          <tbody>
                            {document.lines.map((line) => (
                              <tr key={line.id}>
                                <td data-label="Producto">
                                  {line.name} ({line.sku})
                                </td>
                                <td data-label="Cantidad a reintegrar">
                                  {line.quantity.toLocaleString("es-CO")}{" "}
                                  {line.unit}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <dl>
                        <div>
                          <dt>Motivo</dt>
                          <dd>{reversalReason.trim()}</dd>
                        </div>
                        <div>
                          <dt>Referencia física</dt>
                          <dd>{reversalReference.trim()}</dd>
                        </div>
                        <div>
                          <dt>Observaciones</dt>
                          <dd>{reversalObservation.trim()}</dd>
                        </div>
                      </dl>
                    </div>
                  )}
                  {reversalError ? (
                    <div className="purchase-state--error" role="alert">
                      {reversalError}
                      {!reverse.isPending &&
                      (!reverse.error?.status ||
                        reverse.error.status === 408 ||
                        reverse.error.status >= 500) ? (
                        <p>
                          El resultado puede ser incierto. Reintenta la misma
                          solicitud; el sistema conservará la clave para evitar
                          un segundo reintegro.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="purchase-dialog-actions">
                    <Button
                      variant="secondary"
                      disabled={reverse.isPending}
                      onClick={() =>
                        reversalReview
                          ? setReversalReview(false)
                          : setReversalOpen(false)
                      }
                    >
                      {reversalReview ? "Volver a la evidencia" : "Cancelar"}
                    </Button>
                    {!reversalReview ? (
                      <Button
                        disabled={
                          reversalReason.trim().length < 3 ||
                          !reversalReference.trim() ||
                          reversalObservation.trim().length < 3 ||
                          !Object.values(declarations).every(Boolean)
                        }
                        onClick={() => setReversalReview(true)}
                      >
                        Revisar anulación
                      </Button>
                    ) : (
                      <Button
                        disabled={reverse.isPending}
                        onClick={() => reverse.mutate()}
                      >
                        {reverse.isPending
                          ? "Anulando…"
                          : reversalError
                            ? "Reintentar anulación"
                            : "Anular y reintegrar existencias"}
                      </Button>
                    )}
                  </div>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          ) : null}
          {canReturn ? (
            <Dialog.Root
              open={returnOpen}
              onOpenChange={(open) => {
                if (!returnCustomerGoods.isPending) setReturnOpen(open);
                if (open) {
                  setReturnReview(false);
                  setReturnError("");
                }
              }}
            >
              <Dialog.Trigger asChild>
                <Button variant="secondary">
                  <ArrowCounterClockwise size={17} aria-hidden="true" />{" "}
                  Registrar devolución
                </Button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="dialog-overlay" />
                <Dialog.Content className="purchase-dialog sale-return-dialog">
                  <Dialog.Title>Devolución de {document.number}</Dialog.Title>
                  <Dialog.Description>
                    Registra solo mercancía recibida físicamente. El reintegro a
                    Inventario incluye exclusivamente las unidades aptas.
                  </Dialog.Description>
                  {!returnReview ? (
                    <div className="sale-reversal-form">
                      <label htmlFor="customer-return-reference">
                        Referencia
                      </label>
                      <input
                        id="customer-return-reference"
                        maxLength={120}
                        value={returnReference}
                        onChange={(event) =>
                          setReturnReference(event.target.value)
                        }
                      />
                      <label htmlFor="customer-return-reason">
                        Motivo comercial
                      </label>
                      <textarea
                        id="customer-return-reason"
                        rows={2}
                        maxLength={500}
                        value={returnReason}
                        onChange={(event) =>
                          setReturnReason(event.target.value)
                        }
                      />
                      <label htmlFor="customer-return-observation">
                        Observación de recepción e inspección
                      </label>
                      <textarea
                        id="customer-return-observation"
                        rows={3}
                        maxLength={1000}
                        value={returnObservation}
                        onChange={(event) =>
                          setReturnObservation(event.target.value)
                        }
                      />
                      <section
                        className="sale-return-products"
                        aria-label="Productos y cantidades de devolución"
                      >
                        {hasEligibleReturnLine ? null : (
                          <p className="sale-return-empty" role="status">
                            No hay productos con cantidades pendientes de
                            devolución.
                          </p>
                        )}
                        {document.lines.map((line) => {
                          const value = returnLines[line.id] || {};
                          const pending =
                            line.returnableQuantity ?? line.quantity;
                          const returned = line.returnedQuantity || 0;
                          const received = Number(value.quantityReceived || 0);
                          const restocked = Number(
                            value.quantityRestocked || 0,
                          );
                          const notRestocked =
                            value.selected &&
                            Number.isInteger(received) &&
                            Number.isInteger(restocked) &&
                            received >= restocked
                              ? received - restocked
                              : 0;
                          const cardId = `sale-return-product-${line.id}`;
                          return (
                            <article
                              className={`sale-return-product-card${pending === 0 ? " is-complete" : ""}`}
                              key={line.id}
                              aria-labelledby={`${cardId}-name`}
                            >
                              <header className="sale-return-product-header">
                                {pending > 0 ? (
                                  <label className="sale-return-product-toggle">
                                    <input
                                      type="checkbox"
                                      aria-label={`Seleccionar ${line.name} para devolución`}
                                      checked={Boolean(value.selected)}
                                      onChange={(event) =>
                                        setReturnLines((current) => ({
                                          ...current,
                                          [line.id]: {
                                            ...current[line.id],
                                            selected: event.target.checked,
                                            quantityReceived: event.target
                                              .checked
                                              ? current[line.id]
                                                  ?.quantityReceived || "1"
                                              : "0",
                                          },
                                        }))
                                      }
                                    />
                                    <span>Incluir en esta devolución</span>
                                  </label>
                                ) : (
                                  <p className="sale-return-complete-status">
                                    Todas las unidades de este producto ya
                                    fueron devueltas.
                                  </p>
                                )}
                                <div className="sale-return-product-identity">
                                  <h3 id={`${cardId}-name`}>{line.name}</h3>
                                  <span className="sale-return-sku">
                                    SKU <strong>{line.sku}</strong>
                                  </span>
                                  <span className="sale-return-unit">
                                    Unidad: <strong>{line.unit}</strong>
                                  </span>
                                </div>
                              </header>

                              <dl
                                className="sale-return-quantity-summary"
                                aria-label={`Cantidades históricas de ${line.name}`}
                              >
                                <div data-summary="sold">
                                  <dt>Vendidas originalmente</dt>
                                  <dd>
                                    <strong>
                                      {line.quantity.toLocaleString("es-CO")}
                                    </strong>
                                    <span>{line.unit}</span>
                                  </dd>
                                </div>
                                <div data-summary="returned">
                                  <dt>Devueltas anteriormente</dt>
                                  <dd>
                                    <strong>
                                      {returned.toLocaleString("es-CO")}
                                    </strong>
                                    <span>{line.unit}</span>
                                  </dd>
                                </div>
                                <div data-summary="pending">
                                  <dt>Pendientes de devolución</dt>
                                  <dd>
                                    <strong>
                                      {pending.toLocaleString("es-CO")}
                                    </strong>
                                    <span>{line.unit}</span>
                                  </dd>
                                </div>
                              </dl>

                              {pending > 0 ? (
                                <fieldset
                                  className="sale-return-product-controls"
                                  disabled={!value.selected}
                                  aria-label={`Cantidades de devolución para ${line.name}`}
                                >
                                  <legend>Devolución de este producto</legend>
                                  <label>
                                    Cantidad recibida ahora
                                    <input
                                      aria-label={`Cantidad recibida ahora: ${line.name}`}
                                      type="number"
                                      min="1"
                                      max={pending}
                                      step="1"
                                      aria-describedby={`${cardId}-received-help`}
                                      value={
                                        value.selected
                                          ? (value.quantityReceived ?? "1")
                                          : ""
                                      }
                                      aria-invalid={
                                        value.selected &&
                                        (!Number.isInteger(received) ||
                                          received < 1 ||
                                          received > pending)
                                      }
                                      onChange={(event) =>
                                        setReturnLines((current) => ({
                                          ...current,
                                          [line.id]: {
                                            ...current[line.id],
                                            quantityReceived:
                                              event.target.value,
                                          },
                                        }))
                                      }
                                    />
                                    <small id={`${cardId}-received-help`}>
                                      {value.selected &&
                                      (!Number.isInteger(received) ||
                                        received < 1 ||
                                        received > pending)
                                        ? `Ingresa un entero entre 1 y ${pending}.`
                                        : `Máximo disponible: ${pending} ${line.unit}.`}
                                    </small>
                                  </label>
                                  <label>
                                    Cantidad apta para reintegrar
                                    <input
                                      aria-label={`Cantidad apta para reintegrar: ${line.name}`}
                                      type="number"
                                      min="0"
                                      max={received}
                                      step="1"
                                      aria-describedby={`${cardId}-restocked-help`}
                                      value={
                                        value.selected
                                          ? (value.quantityRestocked ?? "0")
                                          : ""
                                      }
                                      aria-invalid={
                                        value.selected &&
                                        (!Number.isInteger(restocked) ||
                                          restocked < 0 ||
                                          restocked > received ||
                                          restocked > pending)
                                      }
                                      onChange={(event) =>
                                        setReturnLines((current) => ({
                                          ...current,
                                          [line.id]: {
                                            ...current[line.id],
                                            quantityRestocked:
                                              event.target.value,
                                          },
                                        }))
                                      }
                                    />
                                    <small id={`${cardId}-restocked-help`}>
                                      {value.selected &&
                                      (!Number.isInteger(restocked) ||
                                        restocked < 0 ||
                                        restocked > received)
                                        ? `Ingresa un entero entre 0 y ${received}.`
                                        : "No puede superar la cantidad recibida."}
                                    </small>
                                  </label>
                                  <div className="sale-return-not-restocked">
                                    <span>
                                      Cantidad no apta para reintegrar
                                    </span>
                                    <output
                                      aria-label={`Cantidad no apta para reintegrar: ${line.name}`}
                                      aria-live="polite"
                                      data-review="not-restocked"
                                      data-product={line.name}
                                    >
                                      {notRestocked.toLocaleString("es-CO")}{" "}
                                      {line.unit}
                                    </output>
                                    <small>
                                      Se calcula con lo recibido menos lo apto.
                                    </small>
                                  </div>
                                  {value.selected && notRestocked > 0 ? (
                                    <label className="sale-return-reason">
                                      Motivo de no reintegro
                                      <input
                                        aria-label={`Motivo de no reintegro: ${line.name}`}
                                        aria-required="true"
                                        aria-describedby={`${cardId}-reason-help`}
                                        aria-invalid={
                                          !value.nonRestockReason?.trim()
                                        }
                                        maxLength={500}
                                        value={value.nonRestockReason || ""}
                                        onChange={(event) =>
                                          setReturnLines((current) => ({
                                            ...current,
                                            [line.id]: {
                                              ...current[line.id],
                                              nonRestockReason:
                                                event.target.value,
                                            },
                                          }))
                                        }
                                      />
                                      <small id={`${cardId}-reason-help`}>
                                        Obligatorio cuando hay unidades no
                                        aptas.
                                      </small>
                                    </label>
                                  ) : null}
                                </fieldset>
                              ) : null}
                            </article>
                          );
                        })}
                      </section>
                      <fieldset className="sale-reversal-declarations">
                        <legend>Declaraciones obligatorias</legend>
                        {[
                          [
                            "receivedPhysical",
                            "Declaro que recibí físicamente las cantidades indicadas",
                          ],
                          [
                            "inspected",
                            "Declaro que inspeccioné la mercancía y clasifiqué su aptitud",
                          ],
                        ].map(([name, label]) => (
                          <label key={name}>
                            <input
                              type="checkbox"
                              checked={returnDeclarations[name]}
                              onChange={(event) =>
                                setReturnDeclarations((current) => ({
                                  ...current,
                                  [name]: event.target.checked,
                                }))
                              }
                            />
                            <span>{label}</span>
                          </label>
                        ))}
                      </fieldset>
                    </div>
                  ) : (
                    <div className="sale-reversal-review">
                      <p className="sale-neutral-banner">
                        Venta original: {document.number} · Bodega:{" "}
                        {document.warehouseName}. La venta seguirá confirmada.
                      </p>
                      <section
                        className="sale-return-review-products"
                        aria-label="Resumen de productos seleccionados"
                      >
                        {document.lines
                          .filter((line) => returnLines[line.id]?.selected)
                          .map((line) => {
                            const value = returnLines[line.id];
                            const received = Number(value.quantityReceived);
                            const restocked = Number(
                              value.quantityRestocked || 0,
                            );
                            const notRestocked = received - restocked;
                            return (
                              <article
                                className="sale-return-review-card"
                                key={line.id}
                              >
                                <header>
                                  <h3>{line.name}</h3>
                                  <span>SKU {line.sku}</span>
                                  <span>Unidad: {line.unit}</span>
                                </header>
                                <dl>
                                  <div>
                                    <dt>Vendidas originalmente</dt>
                                    <dd>
                                      {line.quantity.toLocaleString("es-CO")}{" "}
                                      {line.unit}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt>Recibidas ahora</dt>
                                    <dd>
                                      {received.toLocaleString("es-CO")}{" "}
                                      {line.unit}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt>Aptas para reintegrar</dt>
                                    <dd>
                                      {restocked.toLocaleString("es-CO")}{" "}
                                      {line.unit}
                                    </dd>
                                  </div>
                                  <div
                                    data-review="not-restocked"
                                    data-product={line.name}
                                  >
                                    <dt>No aptas para reintegrar</dt>
                                    <dd>
                                      {notRestocked.toLocaleString("es-CO")}{" "}
                                      {line.unit}
                                      {notRestocked > 0 ? (
                                        <span className="sale-return-review-reason">
                                          Motivo: {value.nonRestockReason}
                                        </span>
                                      ) : null}
                                    </dd>
                                  </div>
                                </dl>
                              </article>
                            );
                          })}
                      </section>
                      <p>
                        <strong>Referencia:</strong> {returnReference.trim()}
                      </p>
                      <p>
                        <strong>Motivo:</strong> {returnReason.trim()}
                      </p>
                      <p>
                        <strong>Observación:</strong> {returnObservation.trim()}
                      </p>
                    </div>
                  )}
                  {returnError ? (
                    <div className="purchase-state--error" role="alert">
                      {returnError}
                      {!returnCustomerGoods.isPending &&
                      (!returnCustomerGoods.error?.status ||
                        returnCustomerGoods.error.status === 408 ||
                        returnCustomerGoods.error.status >= 500) ? (
                        <p>
                          El resultado puede ser incierto. Reintenta con la
                          misma clave para recuperar el documento sin duplicar
                          el reintegro.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="purchase-dialog-actions">
                    <Button
                      variant="secondary"
                      disabled={returnCustomerGoods.isPending}
                      onClick={() =>
                        returnReview
                          ? setReturnReview(false)
                          : setReturnOpen(false)
                      }
                    >
                      {returnReview ? "Volver al formulario" : "Cancelar"}
                    </Button>
                    {!returnReview ? (
                      <Button
                        disabled={
                          !hasEligibleReturnLine ||
                          returnReference.trim().length < 1 ||
                          returnReason.trim().length < 1 ||
                          returnObservation.trim().length < 3 ||
                          !Object.values(returnDeclarations).every(Boolean) ||
                          !document.lines.some((line) => {
                            const value = returnLines[line.id] || {};
                            const received = Number(value.quantityReceived);
                            const restocked = Number(
                              value.quantityRestocked || 0,
                            );
                            return (
                              value.selected &&
                              Number.isInteger(received) &&
                              received > 0 &&
                              received <=
                                (line.returnableQuantity ?? line.quantity) &&
                              Number.isInteger(restocked) &&
                              restocked >= 0 &&
                              restocked <= received &&
                              (restocked === received ||
                                value.nonRestockReason?.trim())
                            );
                          })
                        }
                        onClick={() => setReturnReview(true)}
                      >
                        Revisar devolución
                      </Button>
                    ) : (
                      <Button
                        disabled={returnCustomerGoods.isPending}
                        onClick={() => returnCustomerGoods.mutate()}
                      >
                        {returnCustomerGoods.isPending
                          ? "Confirmando…"
                          : returnError
                            ? "Reintentar devolución"
                            : "Confirmar devolución definitiva"}
                      </Button>
                    )}
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
      {document.status === "cancelled" && document.confirmedAt ? (
        <section
          className="purchase-form-section sale-reversal-record"
          aria-labelledby="sale-reversal-record-heading"
        >
          <div className="purchase-section-heading">
            <div>
              <h2 id="sale-reversal-record-heading">Anulación de la venta</h2>
              <p>
                La venta original permanece en el historial; se registró un
                movimiento compensatorio.
              </p>
            </div>
            {reversalDocument.data ? (
              <a
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive"
                href={salesApi.reversalPdfUrl(id)}
                download
              >
                <DownloadSimple size={17} aria-hidden="true" />
                Descargar comprobante PDF
              </a>
            ) : null}
          </div>
          {reversalDocument.isPending ? (
            <p role="status">Cargando documento de anulación…</p>
          ) : reversalDocument.isError ? (
            <p className="purchase-state--error" role="alert">
              No se pudo cargar el documento compensatorio:{" "}
              {reversalDocument.error.message}
            </p>
          ) : reversalDocument.data ? (
            <dl className="sale-reversal-record-grid">
              <div>
                <dt>Responsable</dt>
                <dd>{reversalDocument.data.cancelledByName}</dd>
              </div>
              <div>
                <dt>Fecha y hora</dt>
                <dd>
                  {dateTimeFormat.format(
                    new Date(reversalDocument.data.cancelledAt),
                  )}
                </dd>
              </div>
              <div>
                <dt>Motivo</dt>
                <dd>{reversalDocument.data.reason}</dd>
              </div>
              <div>
                <dt>Referencia de verificación</dt>
                <dd>{reversalDocument.data.verificationReference}</dd>
              </div>
              <div>
                <dt>Observaciones</dt>
                <dd>{reversalDocument.data.physicalObservation}</dd>
              </div>
              <div>
                <dt>Movimiento de Inventario</dt>
                <dd>
                  Anulación de venta · operación #
                  {reversalDocument.data.sourceOperationId}
                </dd>
              </div>
              <div className="sale-reversal-disclaimer">
                Las declaraciones físicas fueron realizadas por el responsable;
                SIGECOM no verificó automáticamente la mercancía.
              </div>
            </dl>
          ) : null}
        </section>
      ) : null}
      {document.status === "confirmed" ? (
        <section
          className="purchase-form-section sale-customer-returns"
          aria-labelledby="customer-return-history-heading"
        >
          <div className="purchase-section-heading">
            <div>
              <h2 id="customer-return-history-heading">
                Devoluciones de la venta
              </h2>
              <p>
                La venta conserva su estado confirmado; las cantidades se
                derivan de los documentos definitivos.
              </p>
            </div>
          </div>
          <div className="purchase-table-wrap">
            {customerReturns.isPending ? (
              <p role="status">Cargando historial de devoluciones…</p>
            ) : customerReturns.isError ? (
              <p role="alert" className="purchase-state--error">
                No se pudo cargar el historial: {customerReturns.error.message}
              </p>
            ) : customerReturns.data.items.length === 0 ? (
              <p className="purchase-state">
                Esta venta no tiene devoluciones registradas.
              </p>
            ) : (
              customerReturns.data.items.map((item) => (
                <article className="sale-return-record" key={item.id}>
                  <div className="purchase-section-heading">
                    <div>
                      <h3>
                        {item.number} · {item.reference}
                      </h3>
                      <p>
                        {item.reason} · {item.returnedByName} ·{" "}
                        {dateTimeFormat.format(new Date(item.returnedAt))}
                      </p>
                    </div>
                    <a
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                      href={salesApi.returnPdfUrl(id, item.id)}
                      download
                    >
                      <DownloadSimple size={17} aria-hidden="true" />
                      Comprobante PDF
                    </a>
                  </div>
                  <p>{item.physicalObservation}</p>
                  <div className="purchase-table-wrap">
                    <table className="purchase-products-table">
                      <thead>
                        <tr>
                          <th>Producto / unidad</th>
                          <th>Vendidas</th>
                          <th>Recibidas</th>
                          <th>Reintegradas</th>
                          <th>No aptas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {item.lines.map((line) => (
                          <tr key={line.id}>
                            <td data-label="Producto">
                              {line.name} · {line.unit}
                            </td>
                            <td data-label="Vendidas">
                              {line.soldQuantity.toLocaleString("es-CO")}
                            </td>
                            <td data-label="Recibidas">
                              {line.quantityReceived.toLocaleString("es-CO")}
                            </td>
                            <td data-label="Reintegradas">
                              {line.quantityRestocked.toLocaleString("es-CO")}
                            </td>
                            <td data-label="No aptas">
                              {line.quantityNotRestocked.toLocaleString(
                                "es-CO",
                              )}
                              {line.nonRestockReason
                                ? ` · ${line.nonRestockReason}`
                                : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <small>
                    {item.sourceOperationId
                      ? `Movimiento customer_return #${item.sourceOperationId}`
                      : "Sin movimiento de inventario: ninguna unidad fue apta para reintegro."}
                  </small>
                </article>
              ))
            )}
          </div>
        </section>
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
                {!document.warehouseIsActive ? " (inactiva)" : ""}
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
