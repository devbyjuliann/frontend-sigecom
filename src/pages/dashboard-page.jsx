import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import { AddressBook } from "@phosphor-icons/react/AddressBook";
import { Buildings } from "@phosphor-icons/react/Buildings";
import { Package } from "@phosphor-icons/react/Package";
import { Receipt } from "@phosphor-icons/react/Receipt";
import { ShoppingCart } from "@phosphor-icons/react/ShoppingCart";
import { Tag } from "@phosphor-icons/react/Tag";
import { Truck } from "@phosphor-icons/react/Truck";
import { Warehouse } from "@phosphor-icons/react/Warehouse";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/auth-context.jsx";
import { dashboardApi } from "../lib/auth-api.js";
import { Button } from "../components/ui/button.jsx";
import { formatBogotaDateTime, formatExactCop } from "../lib/sales-activity.js";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "../components/ui/chart.jsx";

const roleNames = {
  administrator: "Administrador",
  seller: "Vendedor",
  warehouse: "Bodega",
  auditor: "Auditor",
};

const shortcuts = [
  {
    label: "Productos",
    path: "/productos",
    permission: "products.read",
    icon: Package,
  },
  {
    label: "Categorías",
    path: "/categorias",
    permission: "categories.read",
    icon: Tag,
  },
  {
    label: "Bodegas",
    path: "/bodegas",
    permission: "warehouses.read",
    icon: Warehouse,
  },
  {
    label: "Clientes",
    path: "/clientes",
    permission: "customers.read",
    icon: AddressBook,
  },
  {
    label: "Proveedores",
    path: "/proveedores",
    permission: "suppliers.read",
    icon: Truck,
  },
  {
    label: "Ventas",
    path: "/ventas",
    permission: "sales.read",
    icon: Receipt,
  },
  {
    label: "Compras",
    path: "/compras",
    permission: "purchases.read",
    icon: ShoppingCart,
  },
  {
    label: "Mi perfil",
    path: "/perfil",
    permission: "profile.read",
    icon: Buildings,
  },
];

const metricDefinitions = [
  {
    key: "activeProducts",
    label: "Productos activos",
    permission: "products.read",
    icon: Package,
  },
  {
    key: "customers",
    label: "Clientes registrados",
    permission: "customers.read",
    icon: AddressBook,
  },
  {
    key: "suppliers",
    label: "Proveedores registrados",
    permission: "suppliers.read",
    icon: Truck,
  },
  {
    key: "accessibleWarehouses",
    label: "Bodegas asignadas",
    permission: "warehouses.read",
    icon: Warehouse,
  },
];

const commercialMetricDefinitions = [
  {
    key: "salesNet",
    label: "Ventas netas del mes",
    permission: "sales.read",
    format: formatExactCop,
    note: "Confirmaciones menos anulaciones y devoluciones equivalentes.",
  },
  {
    key: "purchasesReceived",
    label: "Compras recibidas del mes",
    permission: "purchases.read",
    format: formatExactCop,
    note: "Costo documentado de las recepciones del período.",
  },
  {
    key: "inventoryValue",
    label: "Valor estimado del inventario",
    permissions: ["inventory.read", "products.read"],
    format: formatExactCop,
    note: "Saldo por costo de compra vigente; estimación operativa no contable.",
  },
  {
    key: "stockedProducts",
    label: "Productos con existencias",
    permission: "inventory.read",
    format: formatCount,
    note: "Productos distintos con saldo positivo en tus bodegas.",
  },
  {
    key: "lowStockProducts",
    label: "Productos con stock bajo",
    permission: "inventory.read",
    format: formatCount,
  },
  {
    key: "pendingReceipts",
    label: "Recepciones pendientes",
    permission: "purchases.read",
    format: formatCount,
  },
];

const categoryChartConfig = {
  activeProducts: {
    label: "Productos activos",
    color: "var(--chart-1)",
  },
};
const maxDashboardChartItems = 8;

function greetingForNow() {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "America/Bogota",
    }).format(new Date()),
  );
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

function formatCount(value) {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(
    value,
  );
}

function getDashboardError(error) {
  if (error?.status === 401) {
    return "Tu sesión expiró. Verificando el acceso para continuar…";
  }
  if (error?.status === 403) {
    return "Tu sesión ya no tiene permiso para consultar uno o más indicadores. Actualiza la página o solicita acceso al administrador.";
  }
  return (
    error?.message ||
    "No se pudo cargar el resumen. Comprueba la conexión e inténtalo de nuevo."
  );
}

function LoadingDashboard({ displayName, roleName }) {
  return (
    <section
      className="dashboard-page"
      aria-labelledby="dashboard-title"
      aria-busy="true"
    >
      <header className="dashboard-heading">
        <div>
          <h2 id="dashboard-title">
            {greetingForNow()}, {displayName}
          </h2>
          <p>Resumen de SIGECOM para {roleName.toLocaleLowerCase("es-CO")}.</p>
        </div>
        <span className="dashboard-role">{roleName}</span>
      </header>
      <p className="sr-only" role="status">
        Cargando información autorizada…
      </p>
      <div
        className="dashboard-shortcuts dashboard-shortcuts--loading"
        aria-hidden="true"
      >
        <span />
        <span />
        <span />
        <span />
      </div>
      <div
        className="dashboard-metric-grid dashboard-metric-grid--loading"
        aria-hidden="true"
      >
        <span />
        <span />
        <span />
        <span />
      </div>
      <div
        className="dashboard-lower-grid dashboard-lower-grid--loading"
        aria-hidden="true"
      >
        <span />
        <span />
      </div>
    </section>
  );
}

function CategoryChart({ items }) {
  const sortedItems = [...items].sort(
    (first, second) =>
      second.activeProducts - first.activeProducts ||
      first.categoryName.localeCompare(second.categoryName, "es-CO"),
  );
  const total = sortedItems.reduce((sum, item) => sum + item.activeProducts, 0);
  const hasDistribution = sortedItems.length > 0 && total > 0;
  const chartItems = sortedItems.slice(0, maxDashboardChartItems);
  const remainingItems = sortedItems.slice(maxDashboardChartItems);
  if (remainingItems.length > 0) {
    chartItems.push({
      categoryId: "other-categories",
      categoryName: `Otras categorías (${remainingItems.length})`,
      activeProducts: remainingItems.reduce(
        (sum, item) => sum + item.activeProducts,
        0,
      ),
    });
  }
  const chartHeight = Math.max(chartItems.length * 48 + 24, 216);

  return (
    <section
      className="dashboard-panel dashboard-category-panel"
      aria-labelledby="category-chart-title"
    >
      <div className="dashboard-panel-heading">
        <div>
          <h3 id="category-chart-title">
            Distribución de productos por categoría
          </h3>
          <p>Productos activos · ordenados de mayor a menor</p>
        </div>
        {hasDistribution ? (
          <span className="dashboard-chart-summary">
            {formatCount(total)} productos activos ·{" "}
            {formatCount(sortedItems.length)} categorías
          </span>
        ) : (
          <span className="dashboard-panel-icon" aria-hidden="true">
            <Tag size={18} />
          </span>
        )}
      </div>
      {hasDistribution ? (
        <figure
          className="dashboard-chart-figure"
          aria-labelledby="category-chart-title"
        >
          <div className="dashboard-chart-scroll">
            <ChartContainer
              config={categoryChartConfig}
              className="dashboard-chart aspect-auto"
              style={{ height: chartHeight }}
            >
              <BarChart
                data={chartItems}
                layout="vertical"
                margin={{ top: 10, right: 34, bottom: 8, left: -8 }}
                accessibilityLayer
              >
                <CartesianGrid
                  horizontal={false}
                  stroke="#e8edf4"
                  strokeDasharray="3 5"
                />
                <XAxis
                  type="number"
                  dataKey="activeProducts"
                  allowDecimals={false}
                  hide
                />
                <YAxis
                  type="category"
                  dataKey="categoryName"
                  width={150}
                  interval={0}
                  axisLine={false}
                  tickLine={false}
                  tickMargin={12}
                  tick={{ fill: "#526078", fontSize: 11 }}
                  tickFormatter={(value) =>
                    value.length > 24 ? `${value.slice(0, 23)}…` : value
                  }
                />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      labelFormatter={(label) => label}
                      formatter={(value) => (
                        <span className="font-medium tabular-nums text-foreground">
                          {formatCount(value)} productos
                        </span>
                      )}
                      hideIndicator
                    />
                  }
                />
                <Bar
                  dataKey="activeProducts"
                  name="Productos activos"
                  fill="var(--color-activeProducts)"
                  radius={[0, 7, 7, 0]}
                  maxBarSize={24}
                  isAnimationActive={false}
                >
                  <LabelList
                    dataKey="activeProducts"
                    position="right"
                    offset={9}
                    formatter={formatCount}
                    className="fill-foreground"
                    fontSize={11}
                  />
                </Bar>
              </BarChart>
            </ChartContainer>
          </div>
          <figcaption className="sr-only">
            Distribución real de {formatCount(total)} productos activos en{" "}
            {formatCount(items.length)} categorías.{" "}
            {chartItems
              .map(
                (item) =>
                  `${item.categoryName}: ${formatCount(item.activeProducts)} productos.`,
              )
              .join(" ")}
          </figcaption>
          <ul
            className="sr-only"
            aria-label="Valores de productos por categoría"
          >
            {chartItems.map((item) => (
              <li key={item.categoryId}>
                {item.categoryName}: {formatCount(item.activeProducts)}{" "}
                productos.
              </li>
            ))}
          </ul>
        </figure>
      ) : (
        <div className="dashboard-chart-empty" role="status">
          <span className="dashboard-empty-icon" aria-hidden="true">
            <Package size={21} />
          </span>
          <p>No hay productos activos para distribuir por categoría.</p>
          {items.length === 0 ? (
            <span>
              Al crear categorías y productos activos, el resumen aparecerá
              aquí.
            </span>
          ) : null}
        </div>
      )}
    </section>
  );
}

function monthLabel(value) {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("es-CO", {
    month: "short",
    timeZone: "America/Bogota",
  }).format(new Date(Date.UTC(year, month - 1, 15)));
}

function SalesTrendPanel({ items }) {
  const hasSales = items.some((item) => item.value !== "0.00");
  return (
    <section
      className="dashboard-panel dashboard-commercial-panel"
      aria-labelledby="sales-trend-title"
    >
      <div className="dashboard-panel-heading">
        <div>
          <h3 id="sales-trend-title">Tendencia de ventas</h3>
          <p>Balance comercial de los últimos tres meses · COP</p>
        </div>
      </div>
      {hasSales ? (
        <figure
          className="dashboard-commercial-chart"
          aria-labelledby="sales-trend-title"
        >
          <ChartContainer
            config={{
              sales: { label: "Ventas netas", color: "var(--chart-1)" },
            }}
            className="aspect-auto"
            style={{ height: 236 }}
          >
            <LineChart
              data={items.map((item) => ({
                ...item,
                chartValue: Number(item.value),
              }))}
              margin={{ top: 14, right: 18, bottom: 4, left: 8 }}
              accessibilityLayer
            >
              <CartesianGrid
                vertical={false}
                stroke="#e8edf4"
                strokeDasharray="3 5"
              />
              <XAxis
                dataKey="month"
                tickFormatter={monthLabel}
                tickLine={false}
                axisLine={false}
              />
              <YAxis hide />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(label) => monthLabel(label)}
                    formatter={(_value, _name, payload) => (
                      <span className="font-medium tabular-nums text-foreground">
                        {formatExactCop(payload?.payload?.value)}
                      </span>
                    )}
                    hideIndicator
                  />
                }
              />
              <Line
                dataKey="chartValue"
                name="Ventas netas"
                stroke="var(--color-sales)"
                strokeWidth={2.5}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ChartContainer>
          <figcaption className="sr-only">
            {items
              .map(
                (item) =>
                  `${monthLabel(item.month)}: ${formatExactCop(item.value)}`,
              )
              .join(". ")}
          </figcaption>
          <ul className="sr-only" aria-label="Valores mensuales de ventas">
            {items.map((item) => (
              <li key={item.month}>
                {item.month}: {formatExactCop(item.value)}
              </li>
            ))}
          </ul>
        </figure>
      ) : (
        <p className="dashboard-commercial-empty" role="status">
          No hay ventas registradas en este período.
        </p>
      )}
    </section>
  );
}

function TopProductsPanel({ items }) {
  return (
    <section
      className="dashboard-panel dashboard-commercial-panel"
      aria-labelledby="top-products-title"
    >
      <div className="dashboard-panel-heading">
        <div>
          <h3 id="top-products-title">Productos más vendidos</h3>
          <p>Ordenados por valor comercial neto del mes · COP</p>
        </div>
      </div>
      {items.length ? (
        <ol className="dashboard-product-ranking">
          {items.map((item) => (
            <li key={item.productId}>
              <span className="dashboard-product-ranking__name">
                <strong>{item.name}</strong>
                <small>{item.sku}</small>
              </span>
              <span className="dashboard-product-ranking__quantity">
                {formatCount(BigInt(item.quantity))} {item.unit}
              </span>
              <strong className="dashboard-product-ranking__amount">
                {formatExactCop(item.amount)}
              </strong>
            </li>
          ))}
        </ol>
      ) : (
        <p className="dashboard-commercial-empty" role="status">
          No hay ventas netas en el período.
        </p>
      )}
    </section>
  );
}

function WarehouseStockPanel({ items }) {
  const chartItems = [...items]
    .sort(
      (first, second) =>
        second.stockedProducts - first.stockedProducts ||
        second.stockedPairs - first.stockedPairs ||
        first.warehouseCode.localeCompare(second.warehouseCode, "es-CO"),
    )
    .slice(0, maxDashboardChartItems);
  const chartHeight = Math.max(chartItems.length * 42 + 24, 150);
  return (
    <section
      className="dashboard-panel dashboard-commercial-panel"
      aria-labelledby="warehouse-stock-title"
    >
      <div className="dashboard-panel-heading">
        <div>
          <h3 id="warehouse-stock-title">Inventario por bodega</h3>
          <p>
            {items.length > chartItems.length
              ? `Top ${chartItems.length} de ${items.length} bodegas · productos distintos con existencias positivas`
              : "Productos distintos con existencias positivas"}
          </p>
        </div>
      </div>
      {items.length ? (
        <figure
          className="dashboard-commercial-chart"
          aria-labelledby="warehouse-stock-title"
        >
          <ChartContainer
            config={{
              stockedProducts: {
                label: "Productos con existencias",
                color: "var(--chart-2)",
              },
            }}
            className="aspect-auto"
            style={{ height: chartHeight }}
          >
            <BarChart
              data={chartItems}
              layout="vertical"
              margin={{ top: 8, right: 30, bottom: 8, left: 4 }}
              accessibilityLayer
            >
              <CartesianGrid
                horizontal={false}
                stroke="#e8edf4"
                strokeDasharray="3 5"
              />
              <XAxis type="number" allowDecimals={false} hide />
              <YAxis
                type="category"
                dataKey="warehouseCode"
                width={58}
                tickLine={false}
                axisLine={false}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    formatter={(value) => `${formatCount(value)} productos`}
                    hideIndicator
                  />
                }
              />
              <Bar
                dataKey="stockedProducts"
                name="Productos con existencias"
                fill="var(--color-stockedProducts)"
                radius={[0, 6, 6, 0]}
                maxBarSize={22}
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="stockedProducts"
                  position="right"
                  formatter={formatCount}
                  className="fill-foreground"
                  fontSize={11}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
          <figcaption className="sr-only">
            {items
              .map(
                (item) =>
                  `${item.warehouseCode}, ${item.warehouseName}: ${formatCount(item.stockedProducts)} productos y ${formatCount(item.stockedPairs)} pares producto-bodega con existencias`,
              )
              .join(". ")}
          </figcaption>
          <ul
            className="sr-only"
            aria-label="Existencias autorizadas por bodega"
          >
            {items.map((item) => (
              <li key={item.warehouseId}>
                {item.warehouseCode} · {item.warehouseName}:{" "}
                {formatCount(item.stockedProducts)} productos distintos.
              </li>
            ))}
          </ul>
        </figure>
      ) : (
        <p className="dashboard-commercial-empty" role="status">
          No hay bodegas asignadas para consultar.
        </p>
      )}
    </section>
  );
}

const activityLabels = {
  sale_confirmation: "Venta confirmada",
  sale_cancellation: "Venta anulada",
  customer_return: "Devolución de cliente",
  purchase_receipt: "Recepción de compra",
  supplier_return: "Devolución a proveedor",
};

function RecentActivityPanel({ items }) {
  return (
    <section
      className="dashboard-panel dashboard-commercial-panel"
      aria-labelledby="recent-activity-title"
    >
      <div className="dashboard-panel-heading">
        <div>
          <h3 id="recent-activity-title">Actividad comercial reciente</h3>
          <p>Últimos movimientos visibles según tus permisos y bodegas</p>
        </div>
      </div>
      {items.length ? (
        <ol className="dashboard-recent-activity">
          {items.map((item, index) => (
            <li key={`${item.type}-${item.documentCode}-${index}`}>
              <span>
                <strong>
                  {activityLabels[item.type] || "Actividad comercial"}
                </strong>
                <small>
                  {item.documentCode} · {item.warehouseCode} ·{" "}
                  {formatBogotaDateTime(item.occurredAt)}
                </small>
              </span>
              {item.amount !== null ? (
                <strong>{formatExactCop(item.amount)}</strong>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="dashboard-commercial-empty" role="status">
          No hay actividad comercial registrada.
        </p>
      )}
    </section>
  );
}

export default function DashboardPage() {
  const { session, reloadSession } = useAuth();
  const user = session.user;
  const permissionSet = session.permissions;
  const permissionKey = useMemo(
    () => [...permissionSet].sort().join(","),
    [permissionSet],
  );
  const warehouseKey = useMemo(
    () => [...(session.warehouseIds || [])].sort().join(","),
    [session.warehouseIds],
  );
  const displayName = user.displayName?.trim() || user.email;
  const roleName = roleNames[user.role] || "Usuario";
  const dashboardQuery = useQuery({
    queryKey: ["dashboard", user.id, permissionKey, warehouseKey],
    queryFn: dashboardApi.get,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    if (dashboardQuery.error?.status === 401) {
      void reloadSession();
    }
  }, [dashboardQuery.error, reloadSession]);

  if (dashboardQuery.isPending) {
    return <LoadingDashboard displayName={displayName} roleName={roleName} />;
  }

  if (dashboardQuery.isError) {
    return (
      <section className="dashboard-page" aria-labelledby="dashboard-title">
        <header className="dashboard-heading">
          <div>
            <h2 id="dashboard-title">
              {greetingForNow()}, {displayName}
            </h2>
            <p>
              Resumen de SIGECOM para {roleName.toLocaleLowerCase("es-CO")}.
            </p>
          </div>
          <span className="dashboard-role">{roleName}</span>
        </header>
        <div className="dashboard-error" role="alert">
          <h3>No se pudo cargar el resumen</h3>
          <p>{getDashboardError(dashboardQuery.error)}</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => dashboardQuery.refetch()}
          >
            Reintentar
          </Button>
        </div>
      </section>
    );
  }

  const dashboard = dashboardQuery.data;
  const metrics = metricDefinitions.filter(
    (metric) =>
      permissionSet.includes(metric.permission) &&
      dashboard.indicators[metric.key]?.available === true,
  );
  const visibleShortcuts = shortcuts.filter((item) =>
    permissionSet.includes(item.permission),
  );
  const showCategoryChart =
    permissionSet.includes("products.read") &&
    permissionSet.includes("categories.read") &&
    dashboard.productsByCategory.available === true;
  const commercialMetrics = commercialMetricDefinitions.filter(
    (metric) =>
      (metric.permissions || [metric.permission]).every((permission) =>
        permissionSet.includes(permission),
      ) &&
      permissionSet.includes("warehouses.read") &&
      dashboard.commercial?.[metric.key]?.available === true,
  );
  const commercial = dashboard.commercial;
  const showSalesTrend =
    permissionSet.includes("sales.read") &&
    permissionSet.includes("warehouses.read") &&
    commercial?.salesTrend?.available === true;
  const showTopProducts =
    permissionSet.includes("sales.read") &&
    permissionSet.includes("warehouses.read") &&
    commercial?.topProducts?.available === true;
  const showWarehouseInventory =
    permissionSet.includes("inventory.read") &&
    permissionSet.includes("warehouses.read") &&
    commercial?.inventoryByWarehouse?.available === true;
  const showRecentActivity =
    permissionSet.includes("warehouses.read") &&
    (permissionSet.includes("sales.read") ||
      permissionSet.includes("purchases.read")) &&
    commercial?.recentActivity?.available === true;

  return (
    <section className="dashboard-page" aria-labelledby="dashboard-title">
      <header className="dashboard-heading">
        <div>
          <h2 id="dashboard-title">
            {greetingForNow()}, {displayName}
          </h2>
          <p>Resumen de SIGECOM para {roleName.toLocaleLowerCase("es-CO")}.</p>
        </div>
        <span className="dashboard-role">{roleName}</span>
      </header>

      {visibleShortcuts.length > 0 ? (
        <nav
          className="dashboard-shortcuts"
          aria-label="Accesos directos autorizados"
        >
          <span className="dashboard-shortcuts-label">Ir a</span>
          {visibleShortcuts.map(({ label, path, icon: Icon }) => (
            <Link className="dashboard-shortcut" key={path} to={path}>
              <Icon size={16} aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
      ) : null}

      {metrics.length > 0 ? (
        <section
          className="dashboard-metric-grid"
          aria-label="Indicadores autorizados"
        >
          {metrics.map(({ key, label, icon: Icon }) => (
            <article className="dashboard-metric" key={key}>
              <span className="dashboard-metric-icon" aria-hidden="true">
                <Icon size={19} />
              </span>
              <div className="dashboard-metric-copy">
                <span>{label}</span>
                <strong>{formatCount(dashboard.indicators[key].value)}</strong>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {commercialMetrics.length > 0 ? (
        <section
          className="dashboard-commercial-section"
          aria-label="Indicadores comerciales autorizados"
        >
          <div className="dashboard-commercial-heading">
            <h3>Resumen comercial</h3>
            <p>
              {dashboard.commercial.period.dateFrom} –{" "}
              {dashboard.commercial.period.dateTo} · America/Bogota
            </p>
          </div>
          <div className="dashboard-metric-grid dashboard-commercial-grid">
            {commercialMetrics.map(({ key, label, format, note }) => (
              <article className="dashboard-metric" key={key}>
                <div className="dashboard-metric-copy">
                  <span>{label}</span>
                  <strong>{format(dashboard.commercial[key].value)}</strong>
                  {note ? <small>{note}</small> : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {showCategoryChart ? (
        <div className="dashboard-lower-grid dashboard-lower-grid--single">
          <CategoryChart items={dashboard.productsByCategory.items} />
        </div>
      ) : null}

      {showSalesTrend ||
      showTopProducts ||
      showWarehouseInventory ||
      showRecentActivity ? (
        <div className="dashboard-commercial-panels">
          {showSalesTrend ? (
            <SalesTrendPanel items={commercial.salesTrend.items || []} />
          ) : null}
          {showTopProducts ? (
            <TopProductsPanel items={commercial.topProducts.items || []} />
          ) : null}
          {showWarehouseInventory ? (
            <WarehouseStockPanel
              items={commercial.inventoryByWarehouse.items || []}
            />
          ) : null}
          {showRecentActivity ? (
            <RecentActivityPanel
              items={commercial.recentActivity.items || []}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
