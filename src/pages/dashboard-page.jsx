import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  XAxis,
  YAxis,
} from "recharts";
import { AddressBook } from "@phosphor-icons/react/AddressBook";
import { Buildings } from "@phosphor-icons/react/Buildings";
import { Package } from "@phosphor-icons/react/Package";
import { Tag } from "@phosphor-icons/react/Tag";
import { Truck } from "@phosphor-icons/react/Truck";
import { Warehouse } from "@phosphor-icons/react/Warehouse";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/auth-context.jsx";
import { dashboardApi } from "../lib/auth-api.js";
import { Button } from "../components/ui/button.jsx";
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

const categoryChartConfig = {
  activeProducts: {
    label: "Productos activos",
    color: "var(--chart-1)",
  },
};

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
  const chartHeight = Math.max(sortedItems.length * 48 + 24, 216);

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
                data={sortedItems}
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
            {sortedItems
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
            {sortedItems.map((item) => (
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

      <div className="dashboard-lower-grid">
        {showCategoryChart ? (
          <CategoryChart items={dashboard.productsByCategory.items} />
        ) : null}
        <aside
          className="dashboard-panel dashboard-future-panel"
          aria-labelledby="dashboard-future-title"
        >
          <div className="dashboard-panel-heading">
            <div>
              <h3 id="dashboard-future-title">Métricas aún no disponibles</h3>
              <p>El resumen refleja únicamente operaciones implementadas.</p>
            </div>
            <span className="dashboard-panel-icon" aria-hidden="true">
              <Buildings size={18} />
            </span>
          </div>
          <ul className="dashboard-future-list">
            <li>Ventas y compras</li>
            <li>Movimientos y valorización de inventario</li>
          </ul>
          <p className="dashboard-future-note">
            No se muestran cifras hasta que esos módulos registren datos reales.
          </p>
        </aside>
      </div>
    </section>
  );
}
