import { useState } from "react";
import { LockKey } from "@phosphor-icons/react/LockKey";
import { ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import { SignOut } from "@phosphor-icons/react/SignOut";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context.jsx";
import { Button } from "../components/ui/button.jsx";

const roleNames = {
  administrator: "Administrador",
  seller: "Vendedor",
  warehouse: "Bodega",
  auditor: "Auditor",
};

export function HomePage() {
  const { session } = useAuth();
  const displayName = session.user.displayName || session.user.email;
  return (
    <section className="welcome-page" aria-labelledby="welcome-title">
      <div className="welcome-content">
        <span className="welcome-icon" aria-hidden="true">
          <ShieldCheck size={24} weight="duotone" />
        </span>
        <p className="welcome-label">Sesión activa</p>
        <h2 id="welcome-title">Bienvenido, {displayName}</h2>
        <p className="welcome-description">
          Tu acceso está habilitado como{" "}
          <strong>{roleNames[session.user.role] || "Usuario"}</strong>. Los
          módulos aparecerán aquí cuando estén disponibles para tu perfil.
        </p>
        <div className="welcome-divider" />
        <p className="welcome-note">
          No hay información comercial para mostrar en esta etapa.
        </p>
      </div>
    </section>
  );
}

export function AccessDeniedPage() {
  const { logout, session } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  async function handleLogout() {
    try {
      await logout();
      navigate("/ingresar", { replace: true });
    } catch {
      setError(
        "No se pudo confirmar el cierre de sesión. Comprueba la conexión.",
      );
    }
  }

  return (
    <main className="standalone-state">
      <section className="standalone-card">
        <span
          className="standalone-icon standalone-icon--warning"
          aria-hidden="true"
        >
          <LockKey size={25} />
        </span>
        <h1>Acceso no autorizado</h1>
        <p>
          Tu rol no tiene permiso para ver esta página. Si necesitas acceso,
          contacta al administrador.
        </p>
        <div className="standalone-actions">
          {session.permissions.includes("dashboard.read") ? (
            <Link className="text-link" to="/inicio">
              Volver a Inicio
            </Link>
          ) : null}
          <Button variant="secondary" onClick={handleLogout}>
            <SignOut size={17} aria-hidden="true" /> Cerrar sesión
          </Button>
        </div>
        {error ? (
          <p className="inline-alert" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </main>
  );
}

export function RequiredPasswordPage() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  async function handleLogout() {
    setError("");
    try {
      await logout();
      navigate("/ingresar", { replace: true });
    } catch {
      setError(
        "No se pudo confirmar el cierre de sesión. Comprueba la conexión.",
      );
    }
  }

  return (
    <main className="required-password-page">
      <div className="required-password-brand" translate="no">
        <span>S</span> SIGECOM
      </div>
      <section
        className="required-password-card"
        aria-labelledby="required-password-title"
      >
        <span className="required-password-icon" aria-hidden="true">
          <LockKey size={23} />
        </span>
        <p className="welcome-label">Acción requerida</p>
        <h1 id="required-password-title">Debes cambiar tu contraseña</h1>
        <p>
          La cuenta de {session.user.email} requiere actualizar la contraseña
          antes de usar las funciones del sistema. El acceso operativo permanece
          bloqueado hasta completar este cambio.
        </p>
        <div className="required-password-notice" role="status">
          El cambio de contraseña estará disponible en una próxima
          actualización. Contacta al administrador para recibir asistencia.
        </div>
        <Button
          variant="secondary"
          className="required-password-logout"
          onClick={handleLogout}
        >
          <SignOut size={17} aria-hidden="true" /> Cerrar sesión
        </Button>
        {error ? (
          <p className="inline-alert" role="alert">
            {error}
          </p>
        ) : null}
      </section>
      <p className="required-password-foot">
        Comercializadora S.A.S. · Acceso seguro
      </p>
    </main>
  );
}
