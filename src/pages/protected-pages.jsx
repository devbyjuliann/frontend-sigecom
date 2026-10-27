import { useState } from "react";
import { LockKey } from "@phosphor-icons/react/LockKey";
import { SignOut } from "@phosphor-icons/react/SignOut";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context.jsx";
import PasswordChangeForm from "../components/password-change-form.jsx";
import { Button } from "../components/ui/button.jsx";

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
  const { session, logout, changePassword, isChangingPassword } = useAuth();
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

  async function handlePasswordChange(values) {
    await changePassword(values);
    navigate("/ingresar", {
      replace: true,
      state: { passwordChanged: true },
    });
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
          La cuenta de {session.user.email} debe actualizar la contraseña antes
          de usar SIGECOM. Al completar el cambio, tendrás que iniciar sesión de
          nuevo.
        </p>
        <PasswordChangeForm
          onSubmit={handlePasswordChange}
          isSubmitting={isChangingPassword}
          submitLabel="Cambiar contraseña y continuar"
        />
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
