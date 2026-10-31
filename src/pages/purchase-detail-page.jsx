import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { Check } from "@phosphor-icons/react/Check";
import { PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { Warning } from "@phosphor-icons/react/Warning";
import { Package } from "@phosphor-icons/react/Package";
import { ClockCounterClockwise } from "@phosphor-icons/react/ClockCounterClockwise";
import { ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../auth/auth-context.jsx";
import { Button } from "../components/ui/button.jsx";
import { ApiError, purchasesApi } from "../lib/auth-api.js";

function formatMoney(value) {
  const [whole, fractional = "00"] = String(value).split(".");
  return `$ ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${fractional.padEnd(2, "0").slice(0, 2)}`;
}

function formatReturnedQuantity(lines) {
  const quantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  return `${quantity} ${quantity === 1 ? "unidad devuelta" : "unidades devueltas"}`;
}
const date = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeZone: "America/Bogota",
});
const statusLabels = {
  draft: "Borrador",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
};

function receiptStorageKey(orderId) {
  return `sigecom.purchase-receipt.pending.${orderId}`;
}

function closureStorageKey(orderId) {
  return `sigecom.purchase-closure.pending.${orderId}`;
}

function returnStorageKey(orderId) {
  return `sigecom.purchase-return.pending.${orderId}`;
}

function readPendingReceipt(orderId) {
  try {
    const raw = sessionStorage.getItem(receiptStorageKey(orderId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readPendingClosure(orderId) {
  try {
    const raw = sessionStorage.getItem(closureStorageKey(orderId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function createReceiptKey() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `receipt-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

export default function PurchaseDetailPage() {
  const { id } = useParams();
  const { session } = useAuth();
  const client = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [codeEditOpen, setCodeEditOpen] = useState(false);
  const [commercialCode, setCommercialCode] = useState("");
  const [confirmZeroCost, setConfirmZeroCost] = useState(false);
  const [reason, setReason] = useState("");
  const [closureReason, setClosureReason] = useState("");
  const [closureOpen, setClosureOpen] = useState(false);
  const [closureReviewOpen, setClosureReviewOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptReviewOpen, setReceiptReviewOpen] = useState(false);
  const [receiptReference, setReceiptReference] = useState("");
  const [receiptNotes, setReceiptNotes] = useState("");
  const [receiptQuantities, setReceiptQuantities] = useState({});
  const [returnReceipt, setReturnReceipt] = useState(null);
  const [returnReference, setReturnReference] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [returnQuantities, setReturnQuantities] = useState({});
  const [returnReviewOpen, setReturnReviewOpen] = useState(false);
  const [pendingReturn, setPendingReturn] = useState(() => {
    try {
      const saved = sessionStorage.getItem(returnStorageKey(id));
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const receiptKey = useRef(null);
  const [pendingReceipt, setPendingReceipt] = useState(() =>
    readPendingReceipt(id),
  );
  const [pendingClosure, setPendingClosure] = useState(() =>
    readPendingClosure(id),
  );
  const order = useQuery({
    queryKey: ["purchase-order", id],
    queryFn: () => purchasesApi.get(id),
    retry: false,
  });
  const hasZeroCost = order.data?.lines.some(
    (line) => Number(line.unitCost) === 0,
  );
  const canManage = session.user.role === "administrator";
  const canEdit = canManage && session.permissions.includes("purchases.create");
  const canConfirm =
    canManage && session.permissions.includes("purchases.confirm");
  const canCancel =
    canManage && session.permissions.includes("purchases.cancel");
  const canReceive =
    canManage && session.permissions.includes("purchases.receive");
  const receipts = useQuery({
    queryKey: ["purchase-receipts", id],
    queryFn: () => purchasesApi.receipts(id),
    enabled: order.data?.status === "confirmed",
    retry: false,
  });
  const returnHistory = useQuery({
    queryKey: ["purchase-returns", id],
    queryFn: () => purchasesApi.returns(id),
    enabled: Boolean(order.data),
    retry: false,
  });
  const canReturn =
    canManage && session.permissions.includes("purchases.return");
  const createReturn = useMutation({
    mutationFn: () => {
      const saved =
        pendingReturn ||
        (() => {
          const request = {
            key:
              globalThis.crypto?.randomUUID?.() ||
              `return-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            receiptId: returnReceipt.id,
            input: {
              reference: returnReference.trim(),
              reason: returnReason.trim(),
              lines: returnReceipt.lines
                .filter((line) => Number(returnQuantities[line.id]) > 0)
                .map((line) => ({
                  purchaseReceiptLineId: line.id,
                  quantity: Number(returnQuantities[line.id]),
                })),
            },
          };
          try {
            sessionStorage.setItem(
              returnStorageKey(id),
              JSON.stringify(request),
            );
          } catch {
            /* In-memory retry retains the request. */
          }
          setPendingReturn(request);
          return request;
        })();
      return purchasesApi.createReturn(
        id,
        saved.receiptId,
        saved.input,
        saved.key,
      );
    },
    onSuccess: async (result) => {
      setPendingReturn(null);
      try {
        sessionStorage.removeItem(returnStorageKey(id));
      } catch {
        /* Ignore unavailable storage. */
      }
      setReturnReviewOpen(false);
      setReturnReceipt(null);
      setReturnReference("");
      setReturnReason("");
      setReturnQuantities({});
      await Promise.all([
        order.refetch(),
        receipts.refetch(),
        returnHistory.refetch(),
        client.invalidateQueries({ queryKey: ["inventory"] }),
        client.invalidateQueries({ queryKey: ["purchase-orders"] }),
      ]);
      toast.success(
        result.replayed
          ? "Se recuperó la devolución confirmada."
          : "Devolución confirmada y existencias descontadas.",
      );
    },
    onError: (error) => {
      if (!error.status || error.status === 408 || error.status >= 500) {
        setReturnReviewOpen(false);
        setReturnReceipt(null);
      }
      if (error.status >= 400 && error.status < 500 && error.status !== 408) {
        setPendingReturn(null);
        try {
          sessionStorage.removeItem(returnStorageKey(id));
        } catch {
          // Ignore unavailable browser storage.
        }
      }
      toast.error(
        error.message ||
          "No se pudo confirmar la devolución. Si la respuesta fue incierta, reintenta sin cambiar los datos.",
      );
    },
  });

  async function refresh(updated) {
    await client.setQueryData(["purchase-order", id], updated);
    await client.invalidateQueries({ queryKey: ["purchase-orders"] });
    setConfirmOpen(false);
    setCancelOpen(false);
  }
  const confirm = useMutation({
    mutationFn: () =>
      purchasesApi.confirm(id, {
        expectedVersion: order.data.version,
        confirmZeroCost,
      }),
    onSuccess: async (updated) => {
      await refresh(updated);
      toast.success("Orden confirmada. Las existencias no han cambiado.");
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError
          ? error.message
          : "No se pudo confirmar la orden.",
      ),
  });
  const cancel = useMutation({
    mutationFn: () =>
      purchasesApi.cancel(id, {
        expectedVersion: order.data.version,
        reason: reason.trim(),
      }),
    onSuccess: async (updated) => {
      await refresh(updated);
      toast.success("Orden cancelada.");
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError
          ? error.message
          : "No se pudo cancelar la orden.",
      ),
  });
  const updateCode = useMutation({
    mutationFn: () =>
      purchasesApi.updateCommercialCode(id, {
        commercialCode,
        expectedVersion: order.data.version,
      }),
    onSuccess: async (updated) => {
      await refresh(updated);
      await client.invalidateQueries({ queryKey: ["purchase-receipts", id] });
      setCodeEditOpen(false);
      toast.success("Código comercial actualizado.");
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError
          ? error.message
          : "No se pudo actualizar el código comercial.",
      ),
  });
  const receive = useMutation({
    mutationFn: () => {
      if (!pendingReceipt) {
        const key = createReceiptKey();
        const request = {
          key,
          input: {
            expectedVersion: item.version,
            reference: receiptReference.trim(),
            notes: receiptNotes.trim() || null,
            lines: item.lines
              .filter((line) => Number(receiptQuantities[line.id]) > 0)
              .map((line) => ({
                purchaseOrderLineId: line.id,
                quantity: Number(receiptQuantities[line.id]),
              })),
          },
        };
        receiptKey.current = key;
        setPendingReceipt(request);
        try {
          sessionStorage.setItem(
            receiptStorageKey(id),
            JSON.stringify(request),
          );
        } catch {
          // The current page still retains the same key for in-session retries.
        }
      }
      const request = pendingReceipt || readPendingReceipt(id);
      const retry = request || {
        key: receiptKey.current,
        input: {
          expectedVersion: item.version,
          reference: receiptReference.trim(),
          notes: receiptNotes.trim() || null,
          lines: item.lines
            .filter((line) => Number(receiptQuantities[line.id]) > 0)
            .map((line) => ({
              purchaseOrderLineId: line.id,
              quantity: Number(receiptQuantities[line.id]),
            })),
        },
      };
      return purchasesApi.receive(id, retry.input, retry.key);
    },
    onSuccess: async (result) => {
      receiptKey.current = null;
      setPendingReceipt(null);
      try {
        sessionStorage.removeItem(receiptStorageKey(id));
      } catch {
        // Ignore unavailable browser storage; the server remains authoritative.
      }
      setReceiptReviewOpen(false);
      setReceiptOpen(false);
      setReceiptReference("");
      setReceiptNotes("");
      setReceiptQuantities({});
      await Promise.all([
        order.refetch(),
        receipts.refetch(),
        client.invalidateQueries({ queryKey: ["purchase-orders"] }),
        client.invalidateQueries({ queryKey: ["inventory"] }),
      ]);
      toast.success(
        result.replayed
          ? "Se recuperó la recepción confirmada anteriormente."
          : "Recepción confirmada y existencias actualizadas.",
      );
    },
    onError: (error) => {
      if (!error.status || error.status === 408 || error.status >= 500) {
        setReceiptReviewOpen(false);
        setReceiptOpen(false);
      }
      if (error.status >= 400 && error.status < 500 && error.status !== 408) {
        receiptKey.current = null;
        setPendingReceipt(null);
        try {
          sessionStorage.removeItem(receiptStorageKey(id));
        } catch {
          // Ignore unavailable browser storage.
        }
      }
      toast.error(error.message || "No se pudo confirmar la recepción.");
    },
  });
  const close = useMutation({
    mutationFn: () => {
      const saved = pendingClosure || readPendingClosure(id);
      const request = saved || {
        key: createReceiptKey(),
        input: {
          expectedVersion: item.version,
          reason: closureReason.trim(),
        },
      };
      if (!saved) {
        setPendingClosure(request);
        try {
          sessionStorage.setItem(
            closureStorageKey(id),
            JSON.stringify(request),
          );
        } catch {
          // The current page retains the request for in-session retries.
        }
      }
      return purchasesApi.close(id, request.input, request.key);
    },
    onSuccess: async (updated) => {
      setPendingClosure(null);
      try {
        sessionStorage.removeItem(closureStorageKey(id));
      } catch {
        // Ignore unavailable browser storage; the server remains authoritative.
      }
      setClosureOpen(false);
      setClosureReviewOpen(false);
      await refresh(updated);
      await Promise.all([
        receipts.refetch(),
        client.invalidateQueries({ queryKey: ["purchase-orders"] }),
      ]);
      toast.success(
        updated.replayed
          ? "Se recuperó el cierre registrado anteriormente."
          : "Cantidades pendientes cerradas definitivamente.",
      );
    },
    onError: (error) => {
      if (error.status >= 400 && error.status < 500 && error.status !== 408) {
        setPendingClosure(null);
        try {
          sessionStorage.removeItem(closureStorageKey(id));
        } catch {
          // Ignore unavailable browser storage.
        }
      }
      toast.error(
        error.message || "No se pudieron cerrar las cantidades pendientes.",
      );
    },
  });

  if (order.isPending)
    return (
      <section className="page-section">
        <div className="purchase-state" role="status">
          Cargando orden…
        </div>
      </section>
    );
  if (order.isError)
    return (
      <section className="page-section">
        <div className="purchase-state purchase-state--error" role="alert">
          <h1>No se pudo cargar la orden</h1>
          <p>{order.error.message}</p>
          <Button variant="secondary" onClick={() => order.refetch()}>
            Reintentar
          </Button>
          <Button asChild variant="ghost">
            <Link to="/compras">Volver a órdenes</Link>
          </Button>
        </div>
      </section>
    );

  const item = order.data;
  const hasPending = item.lines.some((line) => line.pendingQuantity > 0);
  const canClose =
    canManage &&
    session.permissions.includes("purchases.close") &&
    item.status === "confirmed" &&
    !item.closure &&
    hasPending &&
    (receipts.data?.items?.length || 0) > 0;
  return (
    <section className="page-section purchase-page">
      <Link className="purchase-back-link" to="/compras">
        <ArrowLeft size={16} aria-hidden="true" />
        Volver a órdenes
      </Link>
      <header className="page-heading purchase-heading">
        <div>
          <div className="purchase-code-line">
            <p className="page-kicker">Código comercial · {item.number}</p>
            {canEdit ? (
              <Button
                variant="ghost"
                className="purchase-code-edit"
                aria-label="Editar código comercial"
                onClick={() => {
                  setCommercialCode(item.number);
                  updateCode.reset();
                  setCodeEditOpen(true);
                }}
              >
                <PencilSimple size={15} aria-hidden="true" /> Editar
              </Button>
            ) : null}
          </div>
          <p className="purchase-internal-id">
            Identificador interno inmutable: {item.id}
          </p>
          <h1>{item.supplierName}</h1>
          <p>Consulta los productos y las condiciones de esta orden.</p>
        </div>
        <span className={`purchase-status purchase-status--${item.status}`}>
          {statusLabels[item.status]}
        </span>
      </header>

      <div className="purchase-detail-layout">
        <div className="purchase-detail-main">
          <section
            className="purchase-form-section"
            aria-labelledby="purchase-detail-lines-heading"
          >
            <div className="purchase-section-heading">
              <div>
                <h2 id="purchase-detail-lines-heading">
                  Productos de la orden
                </h2>
                <p>
                  Cantidades pedidas, recibidas y pendientes según esta orden.
                </p>
              </div>
              <span className="purchase-step">
                {item.lines.length} productos
              </span>
            </div>
            <div className="purchase-lines-wrap">
              <table
                className="purchase-lines-table purchase-order-lines-table"
                aria-label="Productos de la orden"
              >
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>SKU</th>
                    <th>Unidad</th>
                    <th>Cantidad pedida</th>
                    <th>Cantidad recibida</th>
                    <th>Cantidad cerrada</th>
                    <th>Cantidad pendiente</th>
                    <th>Costo unitario</th>
                    <th>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {item.lines.map((line) => (
                    <tr key={line.id}>
                      <td>
                        <strong>{line.name}</strong>
                      </td>
                      <td>{line.sku}</td>
                      <td>{line.unit}</td>
                      <td>
                        {new Intl.NumberFormat("es-CO").format(line.quantity)}
                      </td>
                      <td>
                        {new Intl.NumberFormat("es-CO").format(
                          line.receivedQuantity ?? 0,
                        )}
                      </td>
                      <td>
                        {new Intl.NumberFormat("es-CO").format(
                          line.closedQuantity ?? 0,
                        )}
                      </td>
                      <td>
                        <strong>
                          {new Intl.NumberFormat("es-CO").format(
                            Math.max(
                              0,
                              line.pendingQuantity ??
                                line.quantity - (line.receivedQuantity ?? 0),
                            ),
                          )}
                        </strong>
                      </td>
                      <td>
                        {formatMoney(line.unitCost)}
                        {Number(line.unitCost) === 0 ? (
                          <small className="purchase-zero-inline">
                            Costo cero
                          </small>
                        ) : null}
                      </td>
                      <td>{formatMoney(line.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="purchase-total-row">
              <span>Total de la orden</span>
              <strong>{formatMoney(item.total)}</strong>
            </div>
          </section>
          {item.notes ? (
            <section className="purchase-form-section purchase-notes">
              <h2>Notas</h2>
              <p>{item.notes}</p>
            </section>
          ) : null}
        </div>
        <aside className="purchase-summary" aria-label="Resumen de la orden">
          <h2>Resumen</h2>
          <dl>
            <div>
              <dt>Orden</dt>
              <dd>{item.number}</dd>
            </div>
            <div>
              <dt>Fecha</dt>
              <dd>
                {date.format(
                  new Date(`${String(item.orderDate).slice(0, 10)}T12:00:00Z`),
                )}
              </dd>
            </div>
            <div>
              <dt>Proveedor</dt>
              <dd>
                {item.supplierName}
                <small>{item.supplierIdentification}</small>
              </dd>
            </div>
            <div>
              <dt>Bodega destino</dt>
              <dd>{item.warehouseName}</dd>
            </div>
            {item.reference ? (
              <div>
                <dt>Referencia</dt>
                <dd>{item.reference}</dd>
              </div>
            ) : null}
            <div>
              <dt>Estado</dt>
              <dd>{statusLabels[item.status]}</dd>
            </div>
            {item.closure ? (
              <div className="purchase-closure-summary">
                <dt>Cierre de pendientes</dt>
                <dd>
                  <strong className="purchase-closure-badge">
                    Pendientes cerrados
                  </strong>
                  <small>
                    {date.format(new Date(item.closure.closedAt))} ·{" "}
                    {item.closure.closedByName}
                  </small>
                  <span>{item.closure.reason}</span>
                </dd>
              </div>
            ) : null}
          </dl>
          {item.status === "confirmed" && !canReceive ? (
            <p className="purchase-readonly-note">
              Consulta las cantidades recibidas y pendientes de esta orden.
            </p>
          ) : null}
          {item.status === "cancelled" ? (
            <p className="purchase-readonly-note">
              Motivo: {item.cancellationReason}
            </p>
          ) : null}
          <div className="purchase-detail-actions">
            {item.status === "draft" && canEdit ? (
              <Button asChild variant="secondary">
                <Link to={`/compras/${id}/editar`}>
                  <PencilSimple size={17} aria-hidden="true" />
                  Editar borrador
                </Link>
              </Button>
            ) : null}
            {item.status === "draft" && canConfirm ? (
              <Button
                onClick={() => {
                  setConfirmZeroCost(false);
                  setConfirmOpen(true);
                }}
              >
                <Check size={17} aria-hidden="true" />
                Revisar y confirmar
              </Button>
            ) : null}
            {item.status !== "cancelled" && canCancel ? (
              <Button variant="ghost" onClick={() => setCancelOpen(true)}>
                Cancelar orden
              </Button>
            ) : null}
            {canClose && !pendingClosure ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setClosureReason("");
                  close.reset();
                  setClosureOpen(true);
                }}
              >
                Cerrar cantidades pendientes
              </Button>
            ) : null}
            {item.status === "confirmed" && pendingClosure ? (
              <Button
                variant="secondary"
                disabled={close.isPending}
                onClick={() => close.mutate()}
              >
                {close.isPending ? "Verificando…" : "Reintentar cierre"}
              </Button>
            ) : null}
          </div>
        </aside>
      </div>

      {item.status === "confirmed" ? (
        <section
          className="purchase-form-section purchase-receipts"
          aria-labelledby="purchase-receipts-heading"
        >
          <div className="purchase-section-heading">
            <div>
              <h2 id="purchase-receipts-heading">Recepciones de mercancía</h2>
              <p>
                Registra entregas parciales o completas en {item.warehouseName}.
              </p>
            </div>
            {canReceive &&
            !item.closure &&
            !pendingReceipt &&
            item.lines.some((line) => line.pendingQuantity > 0) ? (
              <Button onClick={() => setReceiptOpen(true)}>
                <Package size={17} aria-hidden="true" /> Registrar recepción
              </Button>
            ) : null}
          </div>
          <div className="purchase-lines-wrap">
            <table className="purchase-lines-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Cantidad pedida</th>
                  <th>Cantidad recibida</th>
                  <th>Cantidad cerrada</th>
                  <th>Cantidad pendiente</th>
                </tr>
              </thead>
              <tbody>
                {item.lines.map((line) => (
                  <tr key={line.id}>
                    <td>
                      <strong>{line.name}</strong>
                      <small>
                        {line.sku} · {line.unit}
                      </small>
                    </td>
                    <td>{line.quantity}</td>
                    <td>{line.receivedQuantity ?? 0}</td>
                    <td>{line.closedQuantity ?? 0}</td>
                    <td>
                      <strong>{line.pendingQuantity ?? line.quantity}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="purchase-receipt-history">
            <h3>
              <ClockCounterClockwise size={17} aria-hidden="true" /> Historial
            </h3>
            {receipts.isPending ? (
              <p role="status">Cargando historial…</p>
            ) : null}
            {receipts.isError ? (
              <div className="purchase-form-error" role="alert">
                {receipts.error.message}{" "}
                <Button variant="ghost" onClick={() => receipts.refetch()}>
                  Reintentar
                </Button>
              </div>
            ) : null}
            {receipts.data?.items?.length ? (
              receipts.data.items.map((receipt) => (
                <details className="purchase-receipt-entry" key={receipt.id}>
                  <summary>
                    <span>
                      <strong>{receipt.reference}</strong>
                      <small>
                        {date.format(new Date(receipt.receivedAt))} ·{" "}
                        {receipt.receivedByName}
                      </small>
                    </span>
                    <span>
                      {receipt.lines.reduce(
                        (sum, line) => sum + line.quantity,
                        0,
                      )}{" "}
                      unidades
                    </span>
                  </summary>
                  <div className="purchase-receipt-expanded">
                    {receipt.notes ? <p>{receipt.notes}</p> : null}
                    {receipt.lines.map((line) => (
                      <p key={line.id}>
                        <span>
                          {line.name} · {line.sku}
                          <small>
                            Recibida {line.quantity} {line.unit} · Devuelta{" "}
                            {line.returnedQuantity || 0} · Disponible para
                            devolver {line.returnableQuantity ?? line.quantity}
                          </small>
                        </span>
                        <strong>
                          {line.quantity} {line.unit}
                        </strong>
                      </p>
                    ))}
                    {canReturn &&
                    receipt.lines.some(
                      (line) => line.returnableQuantity > 0,
                    ) ? (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setReturnReceipt(receipt);
                          setReturnReference("");
                          setReturnReason("");
                          setReturnQuantities({});
                          createReturn.reset();
                        }}
                      >
                        <ArrowCounterClockwise size={16} aria-hidden="true" />{" "}
                        Devolver mercancía
                      </Button>
                    ) : null}
                  </div>
                </details>
              ))
            ) : receipts.isSuccess ? (
              <p className="purchase-empty-history">
                Aún no se han registrado recepciones.
              </p>
            ) : null}
            {pendingReceipt ? (
              <div className="purchase-receipt-retry" role="status">
                {receive.error?.message ? (
                  <strong>{receive.error.message}</strong>
                ) : null}
                <span>
                  Hay una solicitud de recepción pendiente de confirmar para «
                  {pendingReceipt.input.reference}». Reintentar usará la misma
                  clave segura.
                </span>
                <Button
                  variant="secondary"
                  disabled={receive.isPending}
                  onClick={() => receive.mutate()}
                >
                  {receive.isPending ? "Verificando…" : "Reintentar recepción"}
                </Button>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <section
        className="purchase-receipt-history"
        aria-labelledby="purchase-returns-heading"
      >
        <h3 id="purchase-returns-heading">
          <ArrowCounterClockwise size={17} aria-hidden="true" /> Devoluciones a
          proveedor
        </h3>
        {returnHistory.isPending ? (
          <p role="status">Cargando devoluciones…</p>
        ) : null}
        {returnHistory.isError ? (
          <div className="purchase-form-error" role="alert">
            No fue posible cargar el historial.{" "}
            <Button variant="ghost" onClick={() => returnHistory.refetch()}>
              Reintentar
            </Button>
          </div>
        ) : null}
        {returnHistory.data?.items?.length ? (
          returnHistory.data.items.map((item) => (
            <details className="purchase-receipt-entry" key={item.id}>
              <summary>
                <span>
                  <strong>
                    {item.reference} · {item.number}
                  </strong>
                  <small>
                    {date.format(new Date(item.returnedAt))} · Recepción{" "}
                    {item.receiptReference} · {item.returnedByName}
                  </small>
                </span>
                <span>{formatReturnedQuantity(item.lines)}</span>
              </summary>
              <div className="purchase-receipt-expanded">
                <p>{item.reason}</p>
                {item.lines.map((line) => (
                  <p key={line.id}>
                    <span>
                      {line.name} · {line.sku}
                    </span>
                    <strong>
                      {line.quantity} {line.unit}
                    </strong>
                  </p>
                ))}
                <p>
                  Existencias descontadas en {item.warehouseName} · Operación{" "}
                  {item.sourceOperationId}
                </p>
              </div>
            </details>
          ))
        ) : returnHistory.isSuccess ? (
          <p className="purchase-empty-history">
            Aún no se han registrado devoluciones.
          </p>
        ) : null}
      </section>

      {pendingReturn ? (
        <div className="purchase-receipt-retry" role="status">
          <span>
            Hay una solicitud de devolución pendiente de confirmar para «
            {pendingReturn.input.reference}». Reintentar conservará la misma
            solicitud y clave.
          </span>
          <Button
            variant="secondary"
            disabled={createReturn.isPending}
            onClick={() => createReturn.mutate()}
          >
            {createReturn.isPending ? "Verificando…" : "Reintentar devolución"}
          </Button>
        </div>
      ) : null}

      {item.closure ? (
        <section
          className="purchase-closure-history"
          aria-label="Cierre de cantidades pendientes"
        >
          <div className="purchase-closure-history-heading">
            <Warning size={19} aria-hidden="true" />
            <div>
              <h2>Pendientes cerrados</h2>
              <p>
                El cierre es definitivo y no modifica las existencias ni el
                historial de recepciones.
              </p>
            </div>
          </div>
          <dl>
            <div>
              <dt>Fecha</dt>
              <dd>{date.format(new Date(item.closure.closedAt))}</dd>
            </div>
            <div>
              <dt>Responsable</dt>
              <dd>{item.closure.closedByName}</dd>
            </div>
            <div>
              <dt>Motivo</dt>
              <dd>{item.closure.reason}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      <Dialog.Root open={closureOpen} onOpenChange={setClosureOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="purchase-dialog-overlay" />
          <Dialog.Content
            className="purchase-dialog"
            aria-describedby="closure-description"
          >
            <Dialog.Title>Cerrar cantidades pendientes</Dialog.Title>
            <Dialog.Description id="closure-description">
              Este cierre es irreversible. No cambiará las cantidades pedidas,
              las recepciones ni las existencias.
            </Dialog.Description>
            <div
              className="purchase-closure-lines"
              aria-label="Remanentes que se cerrarán"
            >
              {item.lines
                .filter((line) => line.pendingQuantity > 0)
                .map((line) => (
                  <p key={line.id}>
                    <span>
                      <strong>{line.name}</strong>
                      <small>
                        {line.sku} · {line.unit}
                      </small>
                    </span>
                    <strong>
                      {line.pendingQuantity} {line.unit}
                    </strong>
                  </p>
                ))}
            </div>
            <label className="purchase-field" htmlFor="purchase-closure-reason">
              Motivo del cierre *
            </label>
            <textarea
              id="purchase-closure-reason"
              rows={3}
              minLength={3}
              maxLength={500}
              required
              value={closureReason}
              onChange={(event) => setClosureReason(event.target.value)}
            />
            {close.error ? (
              <p className="purchase-form-error" role="alert">
                {close.error.message}
              </p>
            ) : null}
            <div className="purchase-dialog-actions">
              <Dialog.Close asChild>
                <Button variant="secondary">Volver</Button>
              </Dialog.Close>
              <Button
                disabled={
                  closureReason.trim().length < 3 ||
                  closureReason.trim().length > 500
                }
                onClick={() => {
                  close.reset();
                  setClosureOpen(false);
                  setClosureReviewOpen(true);
                }}
              >
                Revisar cierre definitivo
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={closureReviewOpen} onOpenChange={setClosureReviewOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="purchase-dialog-overlay" />
          <Dialog.Content
            className="purchase-dialog"
            aria-describedby="closure-review-description"
          >
            <Dialog.Title>Confirmar cierre definitivo</Dialog.Title>
            <Dialog.Description id="closure-review-description">
              Se cerrarán todas las cantidades pendientes indicadas. Esta acción
              no se puede deshacer y bloqueará nuevas recepciones.
            </Dialog.Description>
            <div className="purchase-closure-lines">
              {item.lines
                .filter((line) => line.pendingQuantity > 0)
                .map((line) => (
                  <p key={line.id}>
                    <span>
                      <strong>{line.name}</strong>
                      <small>
                        {line.sku} · {line.unit}
                      </small>
                    </span>
                    <strong>
                      {line.pendingQuantity} {line.unit}
                    </strong>
                  </p>
                ))}
            </div>
            <div className="purchase-closure-review-reason">
              <strong>Motivo</strong>
              <p>{closureReason.trim()}</p>
            </div>
            {close.error ? (
              <p className="purchase-form-error" role="alert">
                {close.error.message}
              </p>
            ) : null}
            <div className="purchase-dialog-actions">
              <Button
                variant="secondary"
                onClick={() => {
                  setClosureReviewOpen(false);
                  setClosureOpen(true);
                }}
              >
                Volver a revisar
              </Button>
              <Button disabled={close.isPending} onClick={() => close.mutate()}>
                {close.isPending ? "Cerrando…" : "Confirmar cierre"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={receiptOpen} onOpenChange={setReceiptOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="purchase-dialog-overlay" />
          <Dialog.Content
            className="purchase-dialog purchase-receipt-dialog"
            aria-describedby="receipt-description"
          >
            <Dialog.Title>Registrar recepción</Dialog.Title>
            <Dialog.Description id="receipt-description">
              Ingresa las cantidades recibidas físicamente. La bodega destino es{" "}
              {item.warehouseName}.
            </Dialog.Description>
            <label className="purchase-field" htmlFor="receipt-reference">
              Referencia de entrega *
            </label>
            <input
              id="receipt-reference"
              maxLength={120}
              value={receiptReference}
              onChange={(event) => setReceiptReference(event.target.value)}
              placeholder="Ej. Remisión 00452"
            />
            <div className="purchase-receipt-quantity-heading">
              <strong>Cantidades a recibir</strong>
              <button
                type="button"
                className="purchase-text-action"
                onClick={() =>
                  setReceiptQuantities(
                    Object.fromEntries(
                      item.lines
                        .filter((line) => line.pendingQuantity > 0)
                        .map((line) => [line.id, String(line.pendingQuantity)]),
                    ),
                  )
                }
              >
                Completar pendientes
              </button>
            </div>
            <div className="purchase-receipt-inputs">
              {item.lines
                .filter((line) => line.pendingQuantity > 0)
                .map((line) => (
                  <label key={line.id} className="purchase-receipt-line">
                    <span>
                      <strong>{line.name}</strong>
                      <small>Pendiente: {line.pendingQuantity}</small>
                    </span>
                    <input
                      aria-label={`Cantidad recibida de ${line.name}`}
                      type="number"
                      min="0"
                      max={line.pendingQuantity}
                      step="1"
                      inputMode="numeric"
                      value={receiptQuantities[line.id] ?? ""}
                      onChange={(event) =>
                        setReceiptQuantities((current) => ({
                          ...current,
                          [line.id]: event.target.value,
                        }))
                      }
                    />
                  </label>
                ))}
            </div>
            <label className="purchase-field" htmlFor="receipt-notes">
              Observaciones (opcional)
            </label>
            <textarea
              id="receipt-notes"
              rows={2}
              maxLength={1000}
              value={receiptNotes}
              onChange={(event) => setReceiptNotes(event.target.value)}
            />
            {receive.error ? (
              <p className="purchase-form-error" role="alert">
                {receive.error.message}{" "}
                {receive.error.status === 0
                  ? "Puedes reintentar: se conservará la misma clave de solicitud."
                  : "Actualiza la orden si cambió la cantidad pendiente."}
              </p>
            ) : null}
            <div className="purchase-dialog-actions">
              <Dialog.Close asChild>
                <Button variant="secondary">Volver</Button>
              </Dialog.Close>
              <Button
                disabled={
                  !receiptReference.trim() ||
                  !item.lines.some((line) => {
                    const quantity = Number(receiptQuantities[line.id]);
                    return (
                      Number.isInteger(quantity) &&
                      quantity > 0 &&
                      quantity <= line.pendingQuantity
                    );
                  }) ||
                  item.lines.some(
                    (line) =>
                      receiptQuantities[line.id] &&
                      (!Number.isInteger(Number(receiptQuantities[line.id])) ||
                        Number(receiptQuantities[line.id]) >
                          line.pendingQuantity),
                  )
                }
                onClick={() => {
                  receive.reset();
                  setReceiptOpen(false);
                  setReceiptReviewOpen(true);
                }}
              >
                Revisar recepción
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={receiptReviewOpen} onOpenChange={setReceiptReviewOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="purchase-dialog-overlay" />
          <Dialog.Content
            className="purchase-dialog"
            aria-describedby="receipt-review-description"
          >
            <Dialog.Title>Revisar recepción</Dialog.Title>
            <Dialog.Description id="receipt-review-description">
              Confirma la referencia {receiptReference}. Las existencias de{" "}
              {item.warehouseName} aumentarán al confirmar.
            </Dialog.Description>
            <div className="purchase-review-total">
              <span>
                {
                  Object.values(receiptQuantities).filter(
                    (quantity) => Number(quantity) > 0,
                  ).length
                }{" "}
                productos · Unidades recibidas
              </span>
              <strong>
                {Object.values(receiptQuantities).reduce(
                  (sum, quantity) => sum + (Number(quantity) || 0),
                  0,
                )}
              </strong>
            </div>
            <div className="purchase-receipt-review-lines">
              {item.lines
                .filter((line) => Number(receiptQuantities[line.id]) > 0)
                .map((line) => (
                  <p key={line.id}>
                    <span>{line.name}</span>
                    <strong>
                      {Number(receiptQuantities[line.id])} /{" "}
                      {line.pendingQuantity} pendientes
                    </strong>
                  </p>
                ))}
            </div>
            {receive.error ? (
              <p className="purchase-form-error" role="alert">
                {receive.error.message}
              </p>
            ) : null}
            <div className="purchase-dialog-actions">
              <Button
                variant="secondary"
                onClick={() => {
                  setReceiptReviewOpen(false);
                  setReceiptOpen(true);
                }}
              >
                Volver a editar
              </Button>
              <Button
                disabled={receive.isPending}
                onClick={() => receive.mutate()}
              >
                {receive.isPending ? "Confirmando…" : "Confirmar recepción"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={codeEditOpen} onOpenChange={setCodeEditOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="purchase-dialog-overlay" />
          <Dialog.Content
            className="purchase-dialog"
            aria-describedby="purchase-code-description"
          >
            <Dialog.Title>Editar código comercial</Dialog.Title>
            <Dialog.Description id="purchase-code-description">
              Solo cambiará el código visible. El identificador interno, los
              productos, cantidades, costos y recepciones permanecerán iguales.
            </Dialog.Description>
            <label
              className="purchase-field"
              htmlFor="purchase-commercial-code"
            >
              Código comercial
            </label>
            <input
              id="purchase-commercial-code"
              autoComplete="off"
              maxLength={40}
              value={commercialCode}
              onChange={(event) => setCommercialCode(event.target.value)}
              aria-describedby="purchase-code-format"
            />
            <small id="purchase-code-format" className="purchase-code-format">
              De 1 a 40 caracteres: letras, números, punto, guion, guion bajo o
              barra.
            </small>
            {updateCode.error ? (
              <p className="purchase-form-error" role="alert">
                {updateCode.error.message}
              </p>
            ) : null}
            <div className="purchase-dialog-actions">
              <Dialog.Close asChild>
                <Button variant="secondary">Cancelar</Button>
              </Dialog.Close>
              <Button
                disabled={
                  updateCode.isPending ||
                  !/^[A-Z0-9][A-Z0-9._/-]{0,39}$/i.test(commercialCode.trim())
                }
                onClick={() => updateCode.mutate()}
              >
                {updateCode.isPending ? "Guardando…" : "Guardar código"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="purchase-dialog-overlay" />
          <Dialog.Content
            className="purchase-dialog"
            aria-describedby="confirm-purchase-description"
          >
            <Dialog.Title>Revisar confirmación</Dialog.Title>
            <Dialog.Description id="confirm-purchase-description">
              Confirma {item.number} para {item.supplierName}. Se conservarán
              estas cantidades y costos; confirmar no cambia las existencias.
            </Dialog.Description>
            <div className="purchase-review-total">
              <span>{item.lines.length} productos · Total</span>
              <strong>{formatMoney(item.total)}</strong>
            </div>
            {hasZeroCost ? (
              <label className="purchase-zero-confirm">
                <input
                  type="checkbox"
                  checked={confirmZeroCost}
                  onChange={(event) => setConfirmZeroCost(event.target.checked)}
                />
                <span>
                  <Warning size={18} aria-hidden="true" />
                  La orden tiene productos con costo cero. Confirmo que revisé
                  esos valores.
                </span>
              </label>
            ) : null}
            {confirm.error ? (
              <p className="purchase-form-error" role="alert">
                {confirm.error.message}
              </p>
            ) : null}
            <div className="purchase-dialog-actions">
              <Dialog.Close asChild>
                <Button variant="secondary">Volver a revisar</Button>
              </Dialog.Close>
              <Button
                disabled={
                  confirm.isPending || (hasZeroCost && !confirmZeroCost)
                }
                onClick={() => confirm.mutate()}
              >
                {confirm.isPending ? "Confirmando…" : "Confirmar orden"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={cancelOpen} onOpenChange={setCancelOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="purchase-dialog-overlay" />
          <Dialog.Content
            className="purchase-dialog"
            aria-describedby="cancel-purchase-description"
          >
            <Dialog.Title>Cancelar orden</Dialog.Title>
            <Dialog.Description id="cancel-purchase-description">
              La orden dejará de estar disponible para futuras operaciones. No
              se modifican existencias.
            </Dialog.Description>
            <label className="purchase-field" htmlFor="purchase-cancel-reason">
              Motivo de cancelación
            </label>
            <textarea
              id="purchase-cancel-reason"
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Describe brevemente el motivo"
            />
            {cancel.error ? (
              <p className="purchase-form-error" role="alert">
                {cancel.error.message}
              </p>
            ) : null}
            <div className="purchase-dialog-actions">
              <Dialog.Close asChild>
                <Button variant="secondary">Volver</Button>
              </Dialog.Close>
              <Button
                disabled={cancel.isPending || reason.trim().length < 3}
                onClick={() => cancel.mutate()}
              >
                {cancel.isPending ? "Cancelando…" : "Confirmar cancelación"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={Boolean(returnReceipt)}
        onOpenChange={(open) => {
          if (!open && !createReturn.isPending) {
            setReturnReceipt(null);
            setReturnReviewOpen(false);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="purchase-dialog-overlay" />
          <Dialog.Content
            className="purchase-dialog"
            aria-describedby="supplier-return-description"
          >
            <Dialog.Title>
              {returnReviewOpen
                ? "Revisar devolución"
                : "Devolver mercancía al proveedor"}
            </Dialog.Title>
            <Dialog.Description id="supplier-return-description">
              Recepción {returnReceipt?.reference} · {item.supplierName} ·
              Bodega {item.warehouseName}. La devolución descontará existencias
              disponibles; no cambia lo recibido ni reabre pendientes.
            </Dialog.Description>
            {!returnReviewOpen ? (
              <>
                <label className="purchase-field" htmlFor="return-reference">
                  Referencia de devolución
                </label>
                <input
                  id="return-reference"
                  maxLength={120}
                  value={returnReference}
                  onChange={(event) => setReturnReference(event.target.value)}
                  required
                />
                <label className="purchase-field" htmlFor="return-reason">
                  Motivo
                </label>
                <textarea
                  id="return-reason"
                  rows={3}
                  maxLength={500}
                  value={returnReason}
                  onChange={(event) => setReturnReason(event.target.value)}
                  required
                />
                <div className="purchase-receipt-review-lines">
                  {returnReceipt?.lines.map((line) => (
                    <label className="purchase-receipt-line" key={line.id}>
                      <span>
                        <strong>{line.name}</strong>
                        <small>
                          {line.sku} · {line.unit} · Recibida {line.quantity},
                          devuelta {line.returnedQuantity || 0}, máximo{" "}
                          {line.returnableQuantity ?? line.quantity}
                        </small>
                      </span>
                      <input
                        aria-label={`Cantidad a devolver de ${line.name}`}
                        type="number"
                        min="0"
                        max={line.returnableQuantity ?? line.quantity}
                        step="1"
                        inputMode="numeric"
                        value={returnQuantities[line.id] || ""}
                        onChange={(event) =>
                          setReturnQuantities((current) => ({
                            ...current,
                            [line.id]: event.target.value,
                          }))
                        }
                      />
                    </label>
                  ))}
                </div>
                <div className="purchase-dialog-actions">
                  <Dialog.Close asChild>
                    <Button variant="secondary">Cancelar</Button>
                  </Dialog.Close>
                  <Button
                    disabled={
                      !returnReference.trim() ||
                      returnReason.trim().length < 3 ||
                      !returnReceipt?.lines.some(
                        (line) => Number(returnQuantities[line.id]) > 0,
                      )
                    }
                    onClick={() => setReturnReviewOpen(true)}
                  >
                    Revisar devolución
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="purchase-receipt-review-lines">
                  <p>
                    <strong>Referencia:</strong> {returnReference.trim()}
                  </p>
                  <p>
                    <strong>Motivo:</strong> {returnReason.trim()}
                  </p>
                  {returnReceipt?.lines
                    .filter((line) => Number(returnQuantities[line.id]) > 0)
                    .map((line) => (
                      <p key={line.id}>
                        <span>
                          {line.name} · {line.sku}
                        </span>
                        <strong>
                          {Number(returnQuantities[line.id])} {line.unit}
                        </strong>
                      </p>
                    ))}
                </div>
                <p className="purchase-return-warning">
                  <Warning size={17} aria-hidden="true" /> Al confirmar, estas
                  unidades saldrán de las existencias de {item.warehouseName}.
                  Esta operación confirmada no se puede editar ni anular.
                </p>
                {createReturn.error ? (
                  <p className="purchase-form-error" role="alert">
                    {createReturn.error.message}
                  </p>
                ) : null}
                <div className="purchase-dialog-actions">
                  <Button
                    variant="secondary"
                    disabled={createReturn.isPending}
                    onClick={() => setReturnReviewOpen(false)}
                  >
                    Volver a editar
                  </Button>
                  <Button
                    disabled={createReturn.isPending}
                    onClick={() => createReturn.mutate()}
                  >
                    {createReturn.isPending
                      ? "Confirmando…"
                      : "Confirmar devolución"}
                  </Button>
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
