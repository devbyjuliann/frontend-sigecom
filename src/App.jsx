import { lazy, Suspense, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router-dom";
import { toast, Toaster } from "sonner";
import { AuthProvider, useAuth } from "./auth/auth-context.jsx";
import SessionQueryBoundary from "./auth/session-query-boundary.jsx";
import {
  RedirectIfAuthenticated,
  RequireAuth,
  RequireAuditAccess,
  RequirePermission,
  RequireRoleAdministration,
  RequireReportsAccess,
  RequireUserAdministration,
} from "./auth/route-guards.jsx";

const AppShell = lazy(() => import("./components/app-shell.jsx"));
const LoginPage = lazy(() => import("./pages/login-page.jsx"));
const HomePage = lazy(() => import("./pages/dashboard-page.jsx"));
const AccessDeniedPage = lazy(() =>
  import("./pages/protected-pages.jsx").then((pages) => ({
    default: pages.AccessDeniedPage,
  })),
);
const RequiredPasswordPage = lazy(() =>
  import("./pages/protected-pages.jsx").then((pages) => ({
    default: pages.RequiredPasswordPage,
  })),
);
const ProfilePage = lazy(() => import("./pages/profile-page.jsx"));
const CategoriesPage = lazy(() => import("./pages/categories-page.jsx"));
const WarehousesPage = lazy(() => import("./pages/warehouses-page.jsx"));
const ProductsPage = lazy(() => import("./pages/products-page.jsx"));
const InventoryPage = lazy(() => import("./pages/inventory-page.jsx"));
const CustomersPage = lazy(() =>
  import("./pages/business-partners-page.jsx").then((pages) => ({
    default: pages.CustomersPage,
  })),
);
const SuppliersPage = lazy(() =>
  import("./pages/business-partners-page.jsx").then((pages) => ({
    default: pages.SuppliersPage,
  })),
);
const PurchasesPage = lazy(() => import("./pages/purchases-page.jsx"));
const PurchaseFormPage = lazy(() => import("./pages/purchase-form-page.jsx"));
const PurchaseDetailPage = lazy(
  () => import("./pages/purchase-detail-page.jsx"),
);
const SalesPage = lazy(() => import("./pages/sales-page.jsx"));
const UsersPage = lazy(() => import("./pages/users-page.jsx"));
const RolesPermissionsPage = lazy(
  () => import("./pages/roles-permissions-page.jsx"),
);
const AuditPage = lazy(() => import("./pages/audit-page.jsx"));
const ReportsPage = lazy(() => import("./pages/reports-page.jsx"));
const SaleFormPage = lazy(() => import("./pages/sale-form-page.jsx"));
const SaleDetailPage = lazy(() => import("./pages/sale-detail-page.jsx"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});

function NotFoundPage() {
  return (
    <main className="standalone-state">
      <section className="standalone-card">
        <p className="welcome-label">Página no disponible</p>
        <h1>No encontramos esta página</h1>
        <p>Comprueba la dirección o vuelve a Inicio.</p>
        <Link className="text-link" to="/inicio">
          Volver a Inicio
        </Link>
      </section>
    </main>
  );
}

function AppRoutes() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-screen place-items-center bg-page text-sm text-muted">
          Cargando SIGECOM…
        </main>
      }
    >
      <Routes>
        <Route element={<RedirectIfAuthenticated />}>
          <Route path="/ingresar" element={<LoginPage />} />
        </Route>
        <Route element={<RequireAuth />}>
          <Route
            path="/cambio-obligatorio"
            element={<RequiredPasswordPage />}
          />
          <Route path="/acceso-denegado" element={<AccessDeniedPage />} />
          <Route element={<RequirePermission permission="dashboard.read" />}>
            <Route element={<AppShell />}>
              <Route path="/inicio" element={<HomePage />} />
            </Route>
          </Route>
          <Route element={<RequirePermission permission="profile.read" />}>
            <Route element={<AppShell />}>
              <Route path="/perfil" element={<ProfilePage />} />
            </Route>
          </Route>
          <Route element={<RequireUserAdministration />}>
            <Route element={<AppShell />}>
              <Route path="/usuarios" element={<UsersPage />} />
            </Route>
          </Route>
          <Route element={<RequireRoleAdministration />}>
            <Route element={<AppShell />}>
              <Route
                path="/administracion/roles"
                element={<RolesPermissionsPage />}
              />
            </Route>
          </Route>
          <Route element={<RequireAuditAccess />}>
            <Route element={<AppShell />}>
              <Route path="/auditoria" element={<AuditPage />} />
            </Route>
          </Route>
          <Route element={<RequireReportsAccess />}>
            <Route element={<AppShell />}>
              <Route path="/reportes" element={<ReportsPage />} />
            </Route>
          </Route>
          <Route element={<RequirePermission permission="categories.read" />}>
            <Route element={<AppShell />}>
              <Route path="/categorias" element={<CategoriesPage />} />
            </Route>
          </Route>
          <Route element={<RequirePermission permission="warehouses.read" />}>
            <Route element={<AppShell />}>
              <Route path="/bodegas" element={<WarehousesPage />} />
            </Route>
          </Route>
          <Route element={<RequirePermission permission="products.read" />}>
            <Route element={<AppShell />}>
              <Route path="/productos" element={<ProductsPage />} />
            </Route>
          </Route>
          <Route
            element={
              <RequirePermission
                permission={["inventory.read", "inventory.movements.read"]}
              />
            }
          >
            <Route element={<AppShell />}>
              <Route path="/inventario" element={<InventoryPage />} />
            </Route>
          </Route>
          <Route element={<RequirePermission permission="customers.read" />}>
            <Route element={<AppShell />}>
              <Route path="/clientes" element={<CustomersPage />} />
            </Route>
          </Route>
          <Route element={<RequirePermission permission="suppliers.read" />}>
            <Route element={<AppShell />}>
              <Route path="/proveedores" element={<SuppliersPage />} />
            </Route>
          </Route>
          <Route element={<RequirePermission permission="purchases.read" />}>
            <Route element={<AppShell />}>
              <Route path="/compras" element={<PurchasesPage />} />
              <Route path="/compras/:id" element={<PurchaseDetailPage />} />
            </Route>
          </Route>
          <Route element={<RequirePermission permission="purchases.create" />}>
            <Route element={<AppShell />}>
              <Route path="/compras/nueva" element={<PurchaseFormPage />} />
              <Route
                path="/compras/:id/editar"
                element={<PurchaseFormPage />}
              />
            </Route>
          </Route>
          <Route element={<RequirePermission permission="sales.read" />}>
            <Route element={<AppShell />}>
              <Route path="/ventas" element={<SalesPage />} />
              <Route path="/ventas/:id" element={<SaleDetailPage />} />
            </Route>
          </Route>
          <Route element={<RequirePermission permission="sales.create" />}>
            <Route element={<AppShell />}>
              <Route path="/ventas/nueva" element={<SaleFormPage />} />
              <Route path="/ventas/:id/editar" element={<SaleFormPage />} />
            </Route>
          </Route>
          <Route path="/" element={<Navigate to="/inicio" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

function PendingOperationStorageNotice() {
  const {
    discardedPendingOperations,
    pendingStorageNoticeVersion,
    sessionScopeKey,
  } = useAuth();

  useEffect(() => {
    if (!pendingStorageNoticeVersion && !discardedPendingOperations) return;
    toast.warning("Se descartó una solicitud pendiente de la sesión anterior", {
      description:
        "Antes de repetir una operación, consulta el documento en SIGECOM para confirmar si ya se registró.",
      duration: 12_000,
    });
  }, [
    discardedPendingOperations,
    pendingStorageNoticeVersion,
    sessionScopeKey,
  ]);

  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <SessionQueryBoundary>
            <AppRoutes />
            <PendingOperationStorageNotice />
            <Toaster
              position="bottom-right"
              closeButton
              toastOptions={{ className: "sigecom-toast" }}
            />
          </SessionQueryBoundary>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
