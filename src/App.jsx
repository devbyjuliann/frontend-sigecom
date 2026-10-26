import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "./auth/auth-context.jsx";
import {
  RedirectIfAuthenticated,
  RequireAuth,
  RequirePermission,
} from "./auth/route-guards.jsx";

const AppShell = lazy(() => import("./components/app-shell.jsx"));
const LoginPage = lazy(() => import("./pages/login-page.jsx"));
const HomePage = lazy(() =>
  import("./pages/protected-pages.jsx").then((pages) => ({
    default: pages.HomePage,
  })),
);
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
          <Route path="/" element={<Navigate to="/inicio" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
          <Toaster
            position="bottom-right"
            closeButton
            toastOptions={{ className: "sigecom-toast" }}
          />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
