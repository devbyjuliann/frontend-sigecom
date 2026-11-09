import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/auth-context.jsx";
import SalesActivityPage from "./sales-activity-page.jsx";
import PurchaseReceiptsPage from "./purchase-receipts-page.jsx";
import PurchaseOrdersPage from "./purchase-orders-page.jsx";
import InventoryReportPage from "./inventory-report-page.jsx";

function reportChoices(session) {
  const permissions = new Set(session?.permissions || []);
  const eligibleRole = ["administrator", "auditor"].includes(
    session?.user?.role,
  );
  const common =
    eligibleRole &&
    permissions.has("reports.read") &&
    permissions.has("warehouses.read");
  if (!common) return [];
  return [
    ...(permissions.has("sales.read")
      ? [{ id: "sales", label: "Actividad de Ventas" }]
      : []),
    ...(permissions.has("purchases.read")
      ? [
          { id: "purchases", label: "Recepciones y Devoluciones de Compras" },
          { id: "purchase-orders", label: "Órdenes de Compra y Pendientes" },
        ]
      : []),
    ...(permissions.has("inventory.read") ||
    permissions.has("inventory.movements.read")
      ? [
          {
            id: "inventory",
            label: "Resumen de Inventario y Actividad de Bodega",
          },
        ]
      : []),
  ];
}

function identityScope(session) {
  return JSON.stringify({
    id: session?.user?.id || "",
    role: session?.user?.role || "",
    permissions: [...(session?.permissions || [])].sort(),
  });
}

export default function ReportsPage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const choices = useMemo(() => reportChoices(session), [session]);
  const identity = identityScope(session);
  const previousIdentity = useRef(identity);
  const [selected, setSelected] = useState("");
  const firstChoice = choices.some(({ id }) => id === "sales")
    ? "sales"
    : choices.some(({ id }) => id === "purchases")
      ? "purchases"
      : choices[0]?.id;
  const active = choices.some(({ id }) => id === selected)
    ? selected
    : firstChoice;

  useEffect(() => {
    if (previousIdentity.current === identity) return;
    previousIdentity.current = identity;
    queryClient.removeQueries({ queryKey: ["sales-activity"] });
    queryClient.removeQueries({ queryKey: ["purchase-receipts"] });
    queryClient.removeQueries({ queryKey: ["purchase-orders-report"] });
    queryClient.removeQueries({ queryKey: ["inventory-analytics-report"] });
    setSelected("");
  }, [identity, queryClient]);

  function changeReport(event) {
    const next = event.target.value;
    const old = active;
    setSelected(next);
    if (old && old !== next) {
      const queryKey = {
        sales: "sales-activity",
        purchases: "purchase-receipts",
        "purchase-orders": "purchase-orders-report",
        inventory: "inventory-analytics-report",
      }[old];
      if (queryKey) queryClient.removeQueries({ queryKey: [queryKey] });
    }
  }

  if (!choices.length) {
    return (
      <section className="reports-hub">
        <p className="reports-hub__empty" role="status">
          No tienes reportes disponibles.
        </p>
      </section>
    );
  }

  return (
    <section className="reports-hub" aria-label="Centro de reportes">
      <div className="reports-hub__selector">
        <label htmlFor="report-type">Tipo de reporte</label>
        <select id="report-type" value={active} onChange={changeReport}>
          {choices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.label}
            </option>
          ))}
        </select>
      </div>
      {active === "sales" ? <SalesActivityPage key="sales" /> : null}
      {active === "purchases" ? <PurchaseReceiptsPage key="purchases" /> : null}
      {active === "purchase-orders" ? (
        <PurchaseOrdersPage key="purchase-orders" />
      ) : null}
      {active === "inventory" ? <InventoryReportPage key="inventory" /> : null}
    </section>
  );
}
