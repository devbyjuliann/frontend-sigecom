import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./auth-context.jsx";
import { ApiError } from "../lib/auth-api.js";
import { Button } from "../components/ui/button.jsx";

function SessionStatus({ title, message, onRetry }) {
  return (
    <main className="grid min-h-screen place-items-center bg-page px-5">
      <section className="w-full max-w-md rounded-2xl border border-border bg-white p-8 text-center shadow-panel">
        <div className="mx-auto mb-5 grid size-12 place-items-center rounded-xl bg-blue-50 text-brand">
          <span aria-hidden="true" className="text-xl font-bold">
            S
          </span>
        </div>
        <h1 className="text-xl font-semibold text-ink">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted">{message}</p>
        {onRetry ? (
          <Button className="mt-6" onClick={onRetry}>
            Reintentar
          </Button>
        ) : null}
      </section>
    </main>
  );
}

export function RequireAuth() {
  const { session, isLoading, error, reloadSession } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <SessionStatus
        title="Verificando sesión"
        message="Conectando de forma segura…"
      />
    );
  }
  if (error && !(error instanceof ApiError && error.status === 401)) {
    return (
      <SessionStatus
        title="No se pudo verificar tu sesión"
        message={error.message || "Comprueba la conexión con SIGECOM."}
        onRetry={reloadSession}
      />
    );
  }
  if (!session) {
    return (
      <Navigate to="/ingresar" replace state={{ from: location.pathname }} />
    );
  }
  if (
    session.user.passwordChangeRequired &&
    location.pathname !== "/cambio-obligatorio"
  ) {
    return <Navigate to="/cambio-obligatorio" replace />;
  }
  return <Outlet />;
}

export function RequirePermission({ permission }) {
  const { session } = useAuth();
  const required = Array.isArray(permission) ? permission : [permission];
  if (!required.some((code) => session?.permissions?.includes(code))) {
    return <Navigate to="/acceso-denegado" replace />;
  }
  return <Outlet />;
}

export function RedirectIfAuthenticated() {
  const { session, isLoading } = useAuth();
  if (isLoading) {
    return (
      <SessionStatus
        title="Verificando sesión"
        message="Conectando de forma segura…"
      />
    );
  }
  if (session) {
    return (
      <Navigate
        to={
          session.user.passwordChangeRequired
            ? "/cambio-obligatorio"
            : "/inicio"
        }
        replace
      />
    );
  }
  return <Outlet />;
}
